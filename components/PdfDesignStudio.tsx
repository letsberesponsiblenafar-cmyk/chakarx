'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Download, ImagePlus, Loader2, RefreshCw, RotateCcw, Save } from 'lucide-react';
import PdfPageCanvas from '@/components/PdfPageCanvas';
import { pdfDesignPages, pdfPageDefinition, pdfFontChoices, type PdfPageId, type PdfPageStyle } from '@/lib/pdf-design-pages';
import { defaultPdfDesign, pdfImageSlots, samePdfDesign, type PdfDesignSettings, type PdfDesignLibrary, type PdfImageSlot } from '@/lib/pdf-designs';
import { resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';
import type { PdfPreviewPage } from '@/lib/pdf-design-preview';
import styles from './pdf-design-editor.module.css';

export type StudioPart = 'heading' | 'body' | 'header' | 'footer' | 'images' | 'theme';
export type StudioPreview = { url: string; pageCount: number; settings: PdfDesignSettings; pages?: PdfPreviewPage[] };
type Props = {
  theme: PdfThemeId; drafts: Record<PdfThemeId, PdfDesignSettings>; library: PdfDesignLibrary;
  page: PdfPageId; part: StudioPart; previewNumber: number;
  selectPage: (id: PdfPageId, number?: number) => void; selectPart: (part: StudioPart) => void;
  chooseTheme: (theme: PdfThemeId) => void; update: (settings: PdfDesignSettings) => void;
  connection: 'loading' | 'ready' | 'error'; error: string; loadError: string; notice: string;
  conflict: boolean; busy: boolean; saving: boolean; generating: boolean; applied: boolean; hydrated: boolean;
  validation: string; preview: StudioPreview | null; previewStale: boolean; autoPreview: boolean; setAutoPreview: (value: boolean) => void;
  uploading: { slot: PdfImageSlot; url: string } | null;
  upload: (slot: PdfImageSlot, file?: File) => void; generatePreview: () => void; save: () => void; apply: () => void;
  reload: () => void; confirmReload: boolean; replaceAndReload: () => void; cancelReload: () => void;
  confirmReset: boolean; requestReset: () => void; cancelReset: () => void;
};
const parts: [StudioPart, string][] = [['heading','Heading'],['body','Body text'],['header','Header'],['footer','Footer'],['images','Images'],['theme','Palette']];

export default function PdfDesignStudio(p: Props) {
  const draft = p.drafts[p.theme], saved = p.library[p.theme], dirty = !samePdfDesign(draft, saved.settings);
  const definition = pdfPageDefinition(p.page), pageStyle = draft.pages?.[p.page] || {};
  const pages = p.preview?.pages || pdfDesignPages.map(page => ({ key: page.id, title: page.title }));
  const firstIndex = pages.findIndex(page => page.key === p.page);
  const pageNumber = pages[p.previewNumber - 1]?.key === p.page ? p.previewNumber : Math.max(1, firstIndex + 1);
  const repetitions = pages.filter(page => page.key === p.page).length;
  function field<K extends keyof PdfPageStyle>(key: K, value: PdfPageStyle[K] | undefined) {
    const next = { ...pageStyle }; if (value === undefined) delete next[key]; else next[key] = value;
    const all = { ...draft.pages }; if (Object.keys(next).length) all[p.page] = next; else delete all[p.page];
    p.update({ ...draft, pages: all });
  }
  function resetPage() { const pages = { ...draft.pages }; delete pages[p.page]; p.update({ ...draft, pages }); }
  function colour(label: string, key: keyof PdfPageStyle, fallback: string) {
    const value = String(pageStyle[key] || fallback);
    return <div className={styles.field} key={key}><div className={styles.fieldLabel}><label htmlFor={`style-${key}`}>{label}</label>{pageStyle[key] !== undefined && <button type="button" disabled={p.busy} onClick={() => field(key, undefined)} aria-label={`Reset ${label}`}>Reset</button>}</div><div className={styles.colourInputs}><input type="color" aria-label={`${label} colour`} value={/^#[\da-f]{6}$/i.test(value) ? value : fallback} disabled={p.busy} onChange={e => field(key, e.target.value.toUpperCase())}/><input id={`style-${key}`} aria-label={`${label} hex colour`} value={value} spellCheck={false} maxLength={7} disabled={p.busy} onChange={e => field(key, e.target.value.toUpperCase())}/></div></div>;
  }
  function font(label: string, key: 'headingFont' | 'bodyFont') {
    return <label className={styles.field}><span>{label}</span><select aria-label={label} value={pageStyle[key] || 'original'} disabled={p.busy} onChange={e => field(key, e.target.value === 'original' ? undefined : e.target.value as PdfPageStyle[typeof key])}>{pdfFontChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>;
  }
  function size(label: string, key: 'headingScale' | 'bodyScale' | 'logoScale', min = 85, max = 110) {
    return <label className={styles.field}><span className={styles.rangeLabel}>{label}<output>{Math.round((pageStyle[key] ?? 1) * 100)}%</output></span><input type="range" aria-label={label} min={min} max={max} step={1} value={Math.round((pageStyle[key] ?? 1) * 100)} disabled={p.busy} onChange={e => field(key, Number(e.target.value) === 100 ? undefined : Number(e.target.value) / 100)}/></label>;
  }
  function toggle(label: string, key: 'showLogo' | 'showPageNumber' | 'topDecoration' | 'bottomDecoration', defaultValue = true) {
    return <label className={styles.toggle}><span>{label}</span><input type="checkbox" role="switch" checked={pageStyle[key] ?? defaultValue} disabled={p.busy} onChange={e => field(key, e.target.checked === defaultValue ? undefined : e.target.checked)}/></label>;
  }
  function imageField(id: PdfImageSlot) {
    const slot = pdfImageSlots.find(item => item.id === id)!;
    const logo = id === 'logoLight' || id === 'logoDark';
    const fallback = logo ? id === 'logoLight' ? '/chakar-logo-original-white.png' : '/chakar-logo-original-ink.png' : definition.thumbnail;
    const current = p.uploading?.slot === id ? p.uploading.url : draft.images[id] || fallback;
    function image(url?: string) { const images = { ...draft.images }; if (url) images[id] = url; else delete images[id]; p.update({ ...draft, images }); }
    const defaultImage = defaultPdfDesign(p.theme).images[id];
    return <div className={styles.imageField} key={id}><div className={`${styles.thumbnail} ${id === 'logoLight' ? styles.darkThumbnail : ''}`}><img src={current} alt={`${slot.label} selected image`}/>{p.uploading?.slot === id && <Loader2 size={18} className={styles.spin}/>}</div><div><strong>{slot.label}</strong><small>{draft.images[id] || logo ? slot.ratio : 'Original page artwork'}</small><div className={styles.imageActions}><label className={styles.uploadButton}><ImagePlus size={14}/>{p.uploading?.slot === id ? 'Uploading…' : 'Replace'}<input id={`design-image-${id}`} type="file" aria-label={`${slot.label} Replace`} accept="image/jpeg,image/png,image/webp" disabled={p.busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; p.upload(id,file); }}/></label>{draft.images[id] !== defaultImage && <button type="button" disabled={p.busy} onClick={() => image(defaultImage)} aria-label={`Restore ${slot.label} to the theme default`}>Reset</button>}{draft.images[id] && <button type="button" disabled={p.busy} onClick={() => image()} aria-label={`Use original artwork for ${slot.label}`}>Original</button>}</div></div></div>;
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>DOCUMENT STUDIO</span><h1>Make every page yours.</h1><p>Select a page. Select an element. See your changes.</p></div><Link href="/">Build your trip</Link></header>
    <div className={styles.toolbar}><div className={styles.themeTabs} role="group" aria-label="Design to edit">{(['original','winter'] as const).map(id => <button type="button" key={id} disabled={p.busy} aria-pressed={id === p.theme} onClick={() => p.chooseTheme(id)}><i style={{background:p.drafts[id].colors.dark}}/><i style={{background:p.drafts[id].colors.accent}}/>{resolvePdfTheme(id).name}{!samePdfDesign(p.drafts[id],p.library[id].settings) && <span aria-label="Unsaved changes" className={styles.dot}/>}</button>)}</div><span role="status" className={styles.saveStatus}>{p.connection === 'loading' ? 'Loading saved designs…' : p.connection === 'error' ? 'Built-in design · not connected' : dirty ? 'Unsaved changes' : saved.revision ? `Saved · revision ${saved.revision}` : 'Built-in design'}</span><label className={styles.autoPreview}><input type="checkbox" checked={p.autoPreview} onChange={e => p.setAutoPreview(e.target.checked)}/>Live preview</label></div>
    {p.loadError && <div className={styles.alert} role="alert"><span><strong>Saved designs are unavailable.</strong> {p.loadError} Your draft is still editable.</span><button onClick={p.reload} disabled={p.busy}>Reload saved designs</button></div>}
    {(p.error || p.conflict) && <div className={styles.alert} role="alert"><span>{p.error || 'This design changed elsewhere. Reload before saving.'}</span>{p.conflict && <button disabled={p.busy} onClick={p.reload}>Reload saved designs</button>}</div>}
    {p.confirmReload && <div className={styles.alert} role="alert"><span>Reloading replaces unsaved edits in both themes.</span><button onClick={p.replaceAndReload}>Replace edits and reload</button><button onClick={p.cancelReload}>Keep editing</button></div>}
    {p.notice && <p className={styles.notice} role="status"><Check size={16}/>{p.notice}</p>}
    <div className={styles.studio}>
      <nav className={styles.pageRail} aria-label="PDF pages"><div className={styles.railHeading}>PAGES<span>{pdfDesignPages.length} sections</span></div>{pdfDesignPages.map((page,index) => <button type="button" key={page.id} aria-label={`Edit ${page.title} page`} aria-pressed={p.page === page.id} onClick={() => p.selectPage(page.id)}><span className={styles.pageThumb}><img src={page.id === 'cover' ? resolvePdfTheme(p.theme).preview : page.thumbnail} alt=""/></span><span><small>{String(index + 1).padStart(2,'0')}</small><strong>{page.title}</strong>{draft.pages?.[page.id] && <em>Edited</em>}</span></button>)}</nav>
      <section className={styles.preview} aria-label="PDF preview"><header className={styles.previewHeading}><div><h2>{definition.title}</h2><span>{p.generating ? 'Updating your PDF…' : p.previewStale ? 'Changes pending preview' : p.preview ? 'Preview up to date' : 'Preparing your first preview'}</span></div><button type="button" disabled={p.busy || p.generating || Boolean(p.validation)} onClick={p.generatePreview} aria-label={p.preview ? 'Update preview' : 'Generate preview'}>{p.generating ? <Loader2 size={17} className={styles.spin}/> : <RefreshCw size={17}/>}<span>{p.preview ? 'Refresh' : 'Preview'}</span></button></header>
        <div className={styles.canvasArea}>{p.preview ? <PdfPageCanvas url={p.preview.url} pageNumber={pageNumber} title={definition.title} regions={definition.regions} selectedRegion={p.part} onSelectRegion={region => p.selectPart(region.id as StudioPart)}/> : <div className={styles.coverReference}><img src={p.page === 'cover' ? resolvePdfTheme(p.theme).preview : definition.thumbnail} alt={`${definition.title} built-in reference`}/><span>{p.generating ? 'Generating a complete PDF…' : 'Reference artwork · generate a preview for your changes'}</span></div>}</div>
        <div className={styles.previewFooter}><div className={styles.pagination}><button aria-label="Previous PDF page" disabled={!p.preview || pageNumber <= 1} onClick={() => p.selectPage(pages[pageNumber - 2].key,pageNumber - 1)}><ArrowLeft size={17}/></button><span>{p.preview ? `${pageNumber} / ${p.preview.pageCount}` : 'Page preview'}</span><button aria-label="Next PDF page" disabled={!p.preview || pageNumber >= pages.length} onClick={() => p.selectPage(pages[pageNumber].key,pageNumber + 1)}><ArrowRight size={17}/></button></div>{p.preview && <a href={p.preview.url} download={`Chakar-${p.theme}-Design-Preview.pdf`}><Download size={15}/>Download preview</a>}{p.preview && <a href={p.preview.url} target="_blank" rel="noreferrer">Open PDF</a>}</div>
      </section>
      <section className={styles.inspector} aria-label={`${definition.title} controls`}><div className={styles.inspectorHeading}><span>EDITING</span><h2>{definition.title}</h2>{repetitions > 1 && <p>Applies to all {repetitions} {definition.title.toLowerCase()} pages.</p>}</div><nav className={styles.elementTabs} aria-label="Page elements">{parts.map(([key,label]) => <button type="button" key={key} aria-pressed={p.part === key} onClick={() => p.selectPart(key)}>{label}</button>)}</nav><div className={styles.fields}>
        {p.part === 'heading' && <><h3>Page heading</h3>{font('Heading font','headingFont')}{size('Heading size','headingScale')}{colour('Heading ink','headingColor',definition.dark?'#FFFFFF':'#26211D')}<p className={styles.hint}>Type stays within its original frame.</p></>}
        {p.part === 'body' && <><h3>Text & details</h3>{font('Body font','bodyFont')}{size('Body size','bodyScale')}{colour('Body ink','bodyColor','#26211D')}{colour('Text on dark panels','lightTextColor','#FFFFFF')}<p className={styles.hint}>Includes the smaller labels and details. Trip content is unchanged.</p></>}
        {p.part === 'header' && <><h3>Header & branding</h3>{toggle('Show logo','showLogo',p.page !== 'thanks')}{size('Logo size','logoScale',70,125)}{definition.topDecoration && toggle('Decorative top strip','topDecoration')}<div className={styles.divider}/>{imageField('logoLight')}{imageField('logoDark')}<p className={styles.hint}>Uploaded logos are shared across this theme. Visibility and size apply to this page.</p></>}
        {p.part === 'footer' && <><h3>Footer</h3>{toggle('Page number','showPageNumber',!['cover','thanks'].includes(p.page))}{definition.bottomDecoration && toggle('Footer artwork','bottomDecoration')}<label className={styles.field}><span>Footer text</span><input aria-label="Footer text" placeholder="Your website or a short line" maxLength={100} value={pageStyle.footerText || ''} disabled={p.busy} onChange={e => field('footerText',e.target.value || undefined)}/><small>{(pageStyle.footerText || '').length}/100</small></label>{colour('Footer ink','footerColor',definition.dark?'#FFFFFF':'#2D271F')}</>}
        {p.part === 'images' && <><h3>Photographs & background</h3>{definition.imageSlots.map(slot => imageField(slot as PdfImageSlot))}{definition.paper && colour('Paper background','backgroundColor','#F4F7F8')}{!definition.imageSlots.length && <p className={styles.hint}>This page uses a paper background and vector details.</p>}<p className={styles.hint}>JPG, PNG or WebP · up to 12 MB. Images stay inside their existing frames.</p></>}
        {p.part === 'theme' && <><h3>This page</h3>{colour('Page accent','accent',draft.colors.accent)}{colour('Page deep tone','dark',draft.colors.dark)}<div className={styles.divider}/><h3>Whole theme</h3>{(['accent','dark'] as const).map(key => <label className={styles.field} key={key}><span>{key === 'accent' ? 'Theme accent' : 'Theme deep tone'}</span><div className={styles.colourInputs}><input type="color" aria-label={`${key === 'accent' ? 'Accent' : 'Deep tone'} colour`} value={/^#[a-f\d]{6}$/i.test(draft.colors[key]) ? draft.colors[key] : defaultPdfDesign(p.theme).colors[key]} disabled={p.busy} onChange={e => p.update({...draft,colors:{...draft.colors,[key]:e.target.value.toUpperCase()}})}/><input aria-label={`${key === 'accent' ? 'Accent' : 'Deep tone'} hex colour`} value={draft.colors[key]} maxLength={7} disabled={p.busy} onChange={e => p.update({...draft,colors:{...draft.colors,[key]:e.target.value.toUpperCase()}})}/></div></label>)}<p className={styles.hint}>Theme colours apply wherever a page has no override.</p></>}
        {p.validation && <p className={styles.validation} role="alert">{p.validation}</p>}
      </div><div className={styles.resetRow}><button disabled={p.busy || !draft.pages?.[p.page]} onClick={resetPage}><RotateCcw size={14}/>Reset this page’s styles</button>{p.confirmReset ? <div><p>Restore {resolvePdfTheme(p.theme).name} defaults? This changes the draft only.</p><button onClick={() => p.update(defaultPdfDesign(p.theme))}>Restore defaults</button><button onClick={p.cancelReset}>Cancel</button></div> : <button disabled={p.busy} onClick={p.requestReset}>Restore theme defaults</button>}</div></section>
    </div>
    <footer className={styles.actions}><div><strong>{resolvePdfTheme(p.theme).name}</strong><span>Saved trips keep their existing design.</span></div><div><button type="button" disabled={p.busy || Boolean(p.validation) || !p.hydrated || p.applied} onClick={p.apply}>{p.applied && <Check size={16}/>} {p.applied ? 'Applied to trip' : 'Apply to this trip'}</button><button className={styles.primaryButton} type="button" disabled={p.busy || Boolean(p.validation) || p.connection !== 'ready' || p.conflict || (!dirty && saved.revision > 0)} onClick={p.save}>{p.saving ? <Loader2 size={16} className={styles.spin}/> : <Save size={16}/>} {p.saving ? 'Saving…' : 'Save design'}</button></div></footer>
  </main>;
}
