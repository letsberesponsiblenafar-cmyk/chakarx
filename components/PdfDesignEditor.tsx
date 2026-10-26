'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '@/components/PlannerProvider';
import { resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';
import { effectivePdfDesign, initialPdfDesignLibrary, isPdfDesignAssetUrl, samePdfDesign, validatePdfDesign,
  type PdfDesignLibrary, type PdfDesignRecord, type PdfDesignSettings, type PdfImageSlot } from '@/lib/pdf-designs';
import { preparePdfImageUpload } from '@/lib/pdf-image-upload';
import PdfDesignStudio, { type StudioPart, type StudioPreview } from '@/components/PdfDesignStudio';
import type { PdfPageId } from '@/lib/pdf-design-pages';

type Drafts = Record<PdfThemeId, PdfDesignSettings>;
type Preview = StudioPreview;
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
  const [page, setPage] = useState<PdfPageId>('cover');
  const [part, setPart] = useState<StudioPart>('heading');
  const [previewNumber, setPreviewNumber] = useState(1);
  const [autoPreview, setAutoPreview] = useState(true);
  const previewRequest = useRef(0);
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
  const busy = saving || Boolean(uploading) || connection === 'loading';
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
    return () => { mounted.current = false; loadRequest.current++; previewRequest.current++; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current); };
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
    const settings = validatePdfDesign(draft), request = ++previewRequest.current; setGenerating(true); setError('');
    try {
      const { renderPdfDesignPreview } = await import('@/lib/pdf-design-preview');
      const result = await renderPdfDesignPreview(settings);
      if (!mounted.current || request !== previewRequest.current) { URL.revokeObjectURL(result.url); return; }
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = result.url; setPreview({ ...result, settings: clone(settings) });
    } catch (cause) { if (mounted.current && request === previewRequest.current) setError(cause instanceof Error ? cause.message : 'The PDF preview could not be generated.'); }
    finally { if (mounted.current && request === previewRequest.current) setGenerating(false); }
  }
  function requestReload() { if (anyDirty) setConfirmReload(true); else void loadDesigns(); }

  useEffect(() => {
    setGenerating(false);
    if (!autoPreview || validation || busy) return;
    const timer = setTimeout(() => void generatePreview(), 1000);
    return () => { clearTimeout(timer); previewRequest.current++; };
  }, [draft, theme, validation, autoPreview, busy]);

  return <PdfDesignStudio theme={theme} drafts={drafts} library={library} page={page} part={part} previewNumber={previewNumber}
    selectPage={(id, number = 1) => { setPage(id); setPreviewNumber(number); }} selectPart={setPart} chooseTheme={chooseTheme} update={update}
    connection={connection} error={error} loadError={loadError} notice={notice} conflict={conflict} busy={busy} saving={saving}
    generating={generating} applied={applied} hydrated={planner.hydrated} validation={validation} preview={activePreview || null}
    previewStale={previewStale} autoPreview={autoPreview} setAutoPreview={setAutoPreview} uploading={uploading}
    upload={(slot, file) => void upload(slot,file)} generatePreview={() => void generatePreview()} save={() => void save()} apply={apply}
    reload={requestReload} confirmReload={confirmReload} replaceAndReload={() => void loadDesigns()} cancelReload={() => setConfirmReload(false)}
    confirmReset={confirmReset} requestReset={() => setConfirmReset(true)} cancelReset={() => setConfirmReset(false)}/>;
}
