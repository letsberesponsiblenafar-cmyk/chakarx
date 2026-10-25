'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Download, FileImage, ImagePlus, Loader2, Palette, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { usePlanner } from '@/components/PlannerProvider';
import { resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';
import { defaultPdfDesign, effectivePdfDesign, initialPdfDesignLibrary, isPdfDesignAssetUrl, pdfImageSlots, samePdfDesign, validatePdfDesign,
  type PdfDesignLibrary, type PdfDesignRecord, type PdfDesignSettings, type PdfImageSlot } from '@/lib/pdf-designs';
import { preparePdfImageUpload } from '@/lib/pdf-image-upload';
import styles from './pdf-design-editor.module.css';

const groups = ['Colours', 'Cover', 'Inside pages', 'Closing page', 'Branding'] as const;
type Group = typeof groups[number];
type Drafts = Record<PdfThemeId, PdfDesignSettings>;
type Preview = { url: string; pageCount: number; settings: PdfDesignSettings };
type StoredDraft = { settings: PdfDesignSettings; revision: number };
const DRAFT_KEY = 'chakar-pdf-design-editor-drafts-v1';
const clone = <T,>(value: T): T => structuredClone(value);
function draftsFrom(library: PdfDesignLibrary): Drafts { return { original: clone(library.original.settings), winter: clone(library.winter.settings) }; }
function readDrafts(): Partial<Record<PdfThemeId, StoredDraft>> {
  const result: Partial<Record<PdfThemeId, StoredDraft>> = {};
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw || raw.length > 30000) return result;
    const stored = JSON.parse(raw);
    for (const theme of ['original', 'winter'] as const) {
      const entry = stored?.[theme];
      if (!entry || !Number.isInteger(entry.revision) || entry.revision < 0) continue;
      const settings = validatePdfDesign(entry.settings);
      if (settings.theme === theme) result[theme] = { settings, revision: entry.revision };
    }
  } catch { /* A blocked or obsolete local draft must not block the saved designs. */ }
  return result;
}
function readRecord(value: unknown, theme: PdfThemeId): PdfDesignRecord {
  if (!value || typeof value !== 'object') throw new Error('The saved design could not be read.');
  const record = value as Partial<PdfDesignRecord>, settings = validatePdfDesign(record.settings);
  if (settings.theme !== theme || !Number.isInteger(record.revision) || (record.revision as number) < 0) throw new Error('The saved design could not be read.');
  return { settings, revision: record.revision as number, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null };
}

export default function PdfDesignEditor() {
  const planner = usePlanner();
  const [theme, setTheme] = useState<PdfThemeId>(() => resolvePdfTheme(planner.input.pdfTheme).id);
  const [library, setLibrary] = useState<PdfDesignLibrary>(initialPdfDesignLibrary);
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(initialPdfDesignLibrary()));
  const [group, setGroup] = useState<Group>('Colours');
  const [connection, setConnection] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ slot: PdfImageSlot; url: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [conflicts, setConflicts] = useState<Partial<Record<PdfThemeId, boolean>>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const mounted = useRef(true), previewUrl = useRef<string | null>(null), uploadUrl = useRef<string | null>(null), initializedTheme = useRef(false), loadRequest = useRef(0);
  const draft = drafts[theme], saved = library[theme];
  const dirty = !samePdfDesign(draft, saved.settings);
  const conflict = Boolean(conflicts[theme]);
  const anyDirty = (['original', 'winter'] as const).some(id => !samePdfDesign(drafts[id], library[id].settings));
  const busy = saving || Boolean(uploading) || generating || connection === 'loading';
  const activePreview = preview?.settings.theme === theme ? preview : null;
  const previewStale = Boolean(activePreview && !samePdfDesign(activePreview.settings, draft));
  let validation = '';
  try { validatePdfDesign(draft); } catch (cause) { validation = cause instanceof Error ? cause.message : 'Check the design settings.'; }
  let applied = false;
  try { applied = planner.hydrated && !validation && samePdfDesign(effectivePdfDesign(planner.input), draft); } catch { /* A malformed older draft must not prevent opening the editor. */ }

  async function loadDesigns(restoreDrafts = false) {
    const request = ++loadRequest.current;
    const localDrafts = restoreDrafts ? readDrafts() : {};
    setConnection('loading'); setLoadError(''); setConfirmReload(false);
    try {
      const response = await fetch('/api/pdf-designs', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load your saved designs.');
      const next: PdfDesignLibrary = { original: readRecord(payload.designs?.original, 'original'), winter: readRecord(payload.designs?.winter, 'winter') };
      if (!mounted.current || request !== loadRequest.current) return;
      const restored = draftsFrom(next), stale: Partial<Record<PdfThemeId, boolean>> = {};
      for (const id of ['original', 'winter'] as const) if (localDrafts[id]) {
        restored[id] = clone(localDrafts[id]!.settings);
        if (localDrafts[id]!.revision !== next[id].revision && !samePdfDesign(restored[id], next[id].settings)) stale[id] = true;
      }
      setLibrary(next); setDrafts(restored); setConnection('ready'); setConflicts(stale); setError('');
      if (Object.keys(localDrafts).length) setNotice('Your unsaved design edits have been restored.');
      else setNotice('');
    } catch (cause) {
      if (!mounted.current || request !== loadRequest.current) return;
      setConnection('error'); setLoadError(cause instanceof Error ? cause.message : 'Could not load your saved designs.');
      if (Object.keys(localDrafts).length) setDrafts(previous => ({ ...previous, ...Object.fromEntries(Object.entries(localDrafts).map(([id, entry]) => [id, entry.settings])) }));
    }
  }
  useEffect(() => {
    mounted.current = true; void loadDesigns(true);
    return () => { mounted.current = false; loadRequest.current++; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current); };
  }, []);
  useEffect(() => {
    if (planner.hydrated && !initializedTheme.current) { initializedTheme.current = true; setTheme(resolvePdfTheme(planner.input.pdfTheme).id); }
  }, [planner.hydrated, planner.input.pdfTheme]);
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);
  useEffect(() => {
    if (connection === 'loading') return;
    try {
      const stored: Partial<Record<PdfThemeId, StoredDraft>> = {};
      for (const id of ['original', 'winter'] as const) if (!samePdfDesign(drafts[id], library[id].settings)) {
        // Keep the old baseline on a restored conflict; a revisit must never
        // silently make stale edits eligible to overwrite the newer design.
        const old = conflicts[id] || connection === 'error' ? readDrafts()[id] : undefined;
        stored[id] = { settings: drafts[id], revision: old?.revision ?? library[id].revision };
      }
      if (Object.keys(stored).length) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* Cloud saving still works when browser storage is disabled. */ }
  }, [drafts, library, connection, conflicts]);

  function update(next: PdfDesignSettings) { setDrafts(previous => ({ ...previous, [theme]: next })); setNotice(''); setError(''); setConfirmReset(false); }
  function chooseTheme(id: PdfThemeId) { setTheme(id); setNotice(''); setError(''); setConfirmReset(false); setConfirmReload(false); }
  function setImage(slot: PdfImageSlot, url?: string) {
    const images = { ...draft.images }; if (url) images[slot] = url; else delete images[slot];
    update({ ...draft, images });
  }
  async function upload(slot: PdfImageSlot, file?: File) {
    if (!file || busy) return;
    const target = theme, localUrl = URL.createObjectURL(file);
    uploadUrl.current = localUrl; setUploading({ slot, url: localUrl }); setError(''); setNotice('');
    try {
      const dataUrl = await preparePdfImageUpload(file, slot === 'logoLight' || slot === 'logoDark');
      const response = await fetch('/api/pdf-design-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, name: file.name }), signal: AbortSignal.timeout(30000) });
      const payload = await response.json();
      if (!response.ok || !isPdfDesignAssetUrl(payload.url)) throw new Error(payload.error || 'The image could not be uploaded.');
      if (mounted.current) {
        setDrafts(previous => ({ ...previous, [target]: { ...previous[target], images: { ...previous[target].images, [slot]: payload.url } } }));
        setNotice('Image uploaded. Save the design to keep this change.');
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'The image could not be uploaded.'); }
    finally { URL.revokeObjectURL(localUrl); uploadUrl.current = null; if (mounted.current) setUploading(null); }
  }
  async function save() {
    if (busy || connection !== 'ready' || conflict) return;
    setError(''); setNotice('');
    let settings;
    try { settings = validatePdfDesign(draft); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the design settings.'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/pdf-designs', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, settings, revision: saved.revision }), signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (response.status === 409) { setConflicts(previous => ({ ...previous, [theme]: true })); throw new Error('This design was changed elsewhere. Your edits are still here; reload saved designs before saving again.'); }
      if (!response.ok) throw new Error(payload.error || 'The design could not be saved.');
      const record = readRecord(payload.design, theme);
      if (!mounted.current) return;
      setLibrary(previous => ({ ...previous, [theme]: record })); setDrafts(previous => ({ ...previous, [theme]: clone(record.settings) }));
      setNotice(`${resolvePdfTheme(theme).name} saved. Other saved itineraries are unchanged.`);
      // A confirmed save stays successful even if a secondary refresh fails.
      await planner.refreshPdfDesigns().catch(() => {});
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'The design could not be saved.'); }
    finally { if (mounted.current) setSaving(false); }
  }
  function apply() {
    try { planner.applyPdfDesign(validatePdfDesign(draft)); setNotice('Applied to this trip. Other saved itineraries are unchanged.'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the design settings.'); }
  }
  async function generatePreview() {
    if (busy || validation) return;
    const settings = validatePdfDesign(draft); setGenerating(true); setError('');
    try {
      const { renderPdfDesignPreview } = await import('@/lib/pdf-design-preview');
      const result = await renderPdfDesignPreview(settings);
      if (!mounted.current) { URL.revokeObjectURL(result.url); return; }
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = result.url; setPreview({ ...result, settings: clone(settings) });
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'The PDF preview could not be generated.'); }
    finally { if (mounted.current) setGenerating(false); }
  }
  function requestReload() { if (anyDirty) setConfirmReload(true); else void loadDesigns(); }

  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>DOCUMENT STUDIO</span><h1>PDF designs</h1><p>Refine the colours and imagery. Keep the Chakar layout.</p></div><Link href="/">Build your trip</Link></header>
    <section className={styles.toolbar} aria-label="PDF design selection">
      <div className={styles.themeTabs} role="group" aria-label="Design to edit">{(['original', 'winter'] as const).map(id => <button type="button" key={id} disabled={busy} aria-pressed={theme === id} className={theme === id ? styles.selectedTheme : ''} onClick={() => chooseTheme(id)}><span className={styles.paletteDots} aria-hidden="true"><i style={{ background: drafts[id].colors.dark }}/><i style={{ background: drafts[id].colors.accent }}/></span>{resolvePdfTheme(id).name}{!samePdfDesign(drafts[id], library[id].settings) && <span className={styles.unsavedDot} aria-label="Unsaved changes"/>}</button>)}</div>
      <span className={styles.saveStatus} role="status">{connection === 'loading' ? 'Loading saved designs…' : connection === 'error' ? 'Built-in design · not connected' : dirty ? 'Unsaved changes' : saved.revision ? `Saved · revision ${saved.revision}` : 'Built-in design'}</span>
    </section>
    {loadError && <div className={styles.alert} role="alert"><div><strong>Saved designs are unavailable</strong><span>{loadError} You can still edit and preview the built-in designs.</span></div><button type="button" disabled={busy} onClick={requestReload}>Reload saved designs</button></div>}
    {(error || conflict) && <div className={styles.alert} role="alert"><span>{error || 'This design was changed elsewhere. Reload saved designs before saving again.'}</span>{conflict && <button type="button" disabled={busy} onClick={requestReload}>Reload saved designs</button>}</div>}
    {confirmReload && <div className={styles.confirm} role="alert"><span>Reloading replaces unsaved edits in both themes with the saved designs.</span><div><button type="button" onClick={() => void loadDesigns()}>Replace edits and reload</button><button type="button" onClick={() => setConfirmReload(false)}>Keep editing</button></div></div>}
    {notice && <p className={styles.notice} role="status"><Check size={15}/>{notice}</p>}
    <div className={styles.workspace}>
      <section className={styles.controls} aria-label={`${resolvePdfTheme(theme).name} design settings`}>
        <div className={styles.controlHeading}><div><span>EDIT DESIGN</span><h2>{resolvePdfTheme(theme).name}</h2></div><Palette size={22} strokeWidth={1.5}/></div>
        <nav className={styles.sectionTabs} aria-label="Design elements">{groups.map(item => <button type="button" key={item} aria-pressed={group === item} onClick={() => setGroup(item)} className={group === item ? styles.activeSection : ''}>{item}</button>)}</nav>
        <div className={styles.fields}><h3>{group}</h3>
          {group === 'Colours' ? <>
            <p className={styles.hint}>Changes affect accents and dark tones, not the layout or photographs.</p>
            {([{ key: 'accent', label: 'Accent', hint: 'Highlights and decorative details' }, { key: 'dark', label: 'Deep tone', hint: 'Dark panels and warm ink' }] as const).map(({ key, label, hint }) => <label className={styles.colourField} key={key}><span><strong>{label}</strong><small>{hint}</small></span><span className={styles.colourInputs}><input type="color" aria-label={`${label} colour`} value={/^#[a-f\d]{6}$/i.test(draft.colors[key]) ? draft.colors[key] : defaultPdfDesign(theme).colors[key]} disabled={busy} onChange={event => update({ ...draft, colors: { ...draft.colors, [key]: event.target.value.toUpperCase() } })}/><input type="text" aria-label={`${label} hex colour`} value={draft.colors[key]} spellCheck={false} maxLength={7} disabled={busy} onChange={event => update({ ...draft, colors: { ...draft.colors, [key]: event.target.value.toUpperCase() } })}/></span></label>)}
            <div className={styles.colourSample} style={{ background: /^#[a-f\d]{6}$/i.test(draft.colors.dark) ? draft.colors.dark : '#19384B' }} aria-label="Colour combination sample"><span style={{ color: /^#[a-f\d]{6}$/i.test(draft.colors.accent) ? draft.colors.accent : '#91B8CB' }}>CHAKAR EXPERIENCE</span><strong>A considered journey.</strong><i style={{ background: /^#[a-f\d]{6}$/i.test(draft.colors.accent) ? draft.colors.accent : '#91B8CB' }}/></div>
          </> : <>
            <p className={styles.hint}>{group === 'Branding' ? 'Use a wide, transparent logo. Light and dark pages have separate versions.' : 'Replace individual images. Their frames, captions and page layout stay in place.'}</p>
            <div className={styles.imageFields}>{pdfImageSlots.filter(slot => slot.section === group).map(slot => {
              const logo = slot.id === 'logoLight' || slot.id === 'logoDark', originalLogo = slot.id === 'logoLight' ? '/chakar-logo-original-white.png' : '/chakar-logo-original-ink.png';
              const current = uploading?.slot === slot.id ? uploading.url : draft.images[slot.id] || (logo ? originalLogo : undefined);
              const defaultImage = defaultPdfDesign(theme).images[slot.id], changed = draft.images[slot.id] !== defaultImage;
              return <div className={styles.imageField} key={slot.id}><div className={`${styles.thumbnail} ${logo ? styles.logoThumbnail : ''} ${slot.id === 'logoLight' ? styles.darkThumbnail : ''}`}>{current ? <img src={current} alt={`${slot.label} selected image`}/> : <><FileImage size={25} strokeWidth={1.4}/><span>Original image</span></>}{uploading?.slot === slot.id && <span className={styles.uploadShade}><Loader2 size={20} className={styles.spin}/></span>}</div><div className={styles.imageDetail}><label htmlFor={`design-image-${slot.id}`}>{slot.label}</label><small>{slot.ratio}</small><div className={styles.imageActions}><label className={`${styles.uploadButton} ${busy ? styles.disabled : ''}`}><ImagePlus size={14}/>{uploading?.slot === slot.id ? 'Uploading…' : 'Replace'}<input id={`design-image-${slot.id}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(slot.id, file); }}/></label>{changed && <button type="button" disabled={busy} onClick={() => setImage(slot.id, defaultImage)} aria-label={`Restore ${slot.label} to the theme default`}>Reset</button>}{draft.images[slot.id] && <button type="button" disabled={busy} onClick={() => setImage(slot.id)} aria-label={`Use original artwork for ${slot.label}`}>Original</button>}</div></div></div>;
            })}</div><p className={styles.fileHint}>JPG, PNG or WebP · up to 12 MB. Uploads are optimised for the PDF.</p>
          </>}
          {validation && <p className={styles.validation} role="alert">{validation}</p>}
        </div>
        <div className={styles.resetRow}>{confirmReset ? <div className={styles.resetConfirmation}><span>Restore {resolvePdfTheme(theme).name} defaults? This changes the draft only.</span><div><button type="button" onClick={() => update(defaultPdfDesign(theme))}>Restore defaults</button><button type="button" onClick={() => setConfirmReset(false)}>Cancel</button></div></div> : <button type="button" disabled={busy} onClick={() => setConfirmReset(true)}><RotateCcw size={14}/>Restore theme defaults</button>}</div>
      </section>
      <section className={styles.preview} aria-labelledby="pdf-design-preview-heading">
        <header className={styles.previewHeading}><div><h2 id="pdf-design-preview-heading">PDF preview</h2><span>{generating ? 'Preparing the complete document…' : activePreview ? `${activePreview.pageCount} pages · ${previewStale ? 'update preview to see your edits' : 'matches these settings'}` : 'Original structure, editable visual details'}</span></div><button type="button" className={styles.previewButton} disabled={busy || Boolean(validation)} onClick={() => void generatePreview()}>{generating ? <Loader2 size={15} className={styles.spin}/> : <RefreshCw size={15}/>} {generating ? 'Preparing…' : activePreview ? 'Update preview' : 'Generate preview'}</button></header>
        {activePreview ? <>{previewStale && <div className={styles.stalePreview} role="status">The preview shows your previous settings. Update it to see the latest edits.</div>}<iframe className={styles.pdfFrame} src={`${activePreview.url}#toolbar=1&view=FitH`} title={`${resolvePdfTheme(theme).name} sample PDF preview`}/><div className={styles.previewFoot}><span>Sample itinerary · no trip data is changed</span><a href={activePreview.url} download={`Chakar-${resolvePdfTheme(theme).name}-Design-Preview.pdf`}><Download size={14}/>Download preview</a><a href={activePreview.url} target="_blank" rel="noreferrer">Open PDF</a></div></> : <div className={styles.previewEmpty}><div className={styles.previewPaper}><img src={resolvePdfTheme(theme).preview} alt={`${resolvePdfTheme(theme).name} built-in cover reference`}/></div><div><strong>{resolvePdfTheme(theme).name} cover reference</strong><p>Generate the full PDF to review your colours and uploaded images.</p></div></div>}
      </section>
    </div>
    <footer className={styles.actions}><div><strong>{resolvePdfTheme(theme).name}</strong><span>Save the reusable design, or apply this version to your current trip.</span></div><div className={styles.actionButtons}><button className={styles.secondaryButton} type="button" disabled={busy || Boolean(validation) || !planner.hydrated || applied} onClick={apply}>{applied && <Check size={16}/>} {applied ? 'Applied to trip' : 'Apply to this trip'}</button><button className={styles.primaryButton} type="button" disabled={busy || Boolean(validation) || connection !== 'ready' || conflict || (!dirty && saved.revision > 0)} onClick={() => void save()}>{saving ? <Loader2 size={16} className={styles.spin}/> : <Save size={16}/>} {saving ? 'Saving…' : 'Save design'}</button></div></footer>
  </main>;
}
