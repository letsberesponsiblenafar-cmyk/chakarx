import { resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';
import { pdfPageIds, pdfFontChoices, pdfPageDefinition, type PdfPageId, type PdfPageStyle } from '@/lib/pdf-design-pages';
export { pdfDesignPages, pdfPageIds, pdfFontChoices, pdfPageId, pdfPageDefinition } from '@/lib/pdf-design-pages';
export type { PdfPageId, PdfPageStyle, PdfFontChoice, PdfDesignRegion } from '@/lib/pdf-design-pages';

export const pdfImageSlots = [
  { id: 'coverMain', label: 'Cover photograph', section: 'Cover', ratio: 'Portrait · 1245 × 1314' },
  { id: 'coverStrip', label: 'Cover inset photograph', section: 'Cover', ratio: 'Landscape · 1440 × 558' },
  { id: 'letter', label: 'Welcome letter background', section: 'Inside pages', ratio: '1599 × 1483' },
  { id: 'daywise', label: 'Itinerary photograph', section: 'Inside pages', ratio: 'Portrait · 1122 × 1683' },
  { id: 'hotels', label: 'Hotel page photograph', section: 'Inside pages', ratio: 'Landscape · 2074 × 1383' },
  { id: 'inclusions', label: 'Inclusions background', section: 'Inside pages', ratio: 'Landscape · 640 × 464' },
  { id: 'exclusions', label: 'Exclusions background', section: 'Inside pages', ratio: 'Landscape · 994 × 663' },
  { id: 'policies', label: 'Policies photograph', section: 'Inside pages', ratio: 'Landscape · 2061 × 1546' },
  { id: 'testimonials', label: 'Testimonials photograph', section: 'Inside pages', ratio: 'Landscape · 2496 × 1664' },
  { id: 'thanks1', label: 'Closing photograph 1', section: 'Closing page', ratio: 'Original collage frame' },
  { id: 'thanks2', label: 'Closing photograph 2', section: 'Closing page', ratio: 'Original collage frame' },
  { id: 'thanks3', label: 'Closing photograph 3', section: 'Closing page', ratio: 'Original collage frame' },
  { id: 'thanks4', label: 'Closing photograph 4', section: 'Closing page', ratio: 'Original collage frame' },
  { id: 'thanks5', label: 'Closing photograph 5', section: 'Closing page', ratio: 'Original collage frame' },
  { id: 'logoLight', label: 'Logo on dark pages', section: 'Branding', ratio: 'Transparent PNG · wide logo' },
  { id: 'logoDark', label: 'Logo on light pages', section: 'Branding', ratio: 'Transparent PNG · wide logo' },
] as const;
export type PdfImageSlot = typeof pdfImageSlots[number]['id'];
export type PdfDesignSettings = {
  schemaVersion: 1;
  theme: PdfThemeId;
  colors: { accent: string; dark: string };
  images: Partial<Record<PdfImageSlot, string>>;
  /** Optional overrides keep pre-editor saved snapshots visually unchanged. */
  pages?: Partial<Record<PdfPageId, PdfPageStyle>>;
};
export type PdfDesignRecord = { settings: PdfDesignSettings; revision: number; updatedAt: string | null };
export type PdfDesignLibrary = Record<PdfThemeId, PdfDesignRecord>;
export const PDF_DESIGN_RECORD_PREFIX = '__chakar_pdf_';
export const WINTER_PHOTO = '/pdf-assets/winter/winter-cover.jpg';

export function defaultPdfDesign(theme?: string): PdfDesignSettings {
  const id = resolvePdfTheme(theme).id;
  return { schemaVersion: 1, theme: id,
    colors: id === 'winter' ? { accent: '#91B8CB', dark: '#19384B' } : { accent: '#DEB85B', dark: '#3A280D' },
    images: id === 'winter' ? { coverMain: WINTER_PHOTO, coverStrip: WINTER_PHOTO, letter: WINTER_PHOTO,
      inclusions: WINTER_PHOTO, exclusions: WINTER_PHOTO, thanks1: WINTER_PHOTO, thanks3: WINTER_PHOTO } : {},
  };
}
export function initialPdfDesignLibrary(): PdfDesignLibrary {
  return { original: { settings: defaultPdfDesign('original'), revision: 0, updatedAt: null },
    winter: { settings: defaultPdfDesign('winter'), revision: 0, updatedAt: null } };
}
export function isPdfDesignAssetUrl(value: unknown): value is string {
  return typeof value === 'string' && (value === WINTER_PHOTO || /^\/api\/pdf-design-assets\/[a-f0-9]{64}$/.test(value));
}
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
export function pdfColorContrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}
const pageFields = ['headingFont', 'bodyFont', 'headingColor', 'bodyColor', 'lightTextColor', 'headingScale', 'bodyScale', 'accent', 'dark', 'backgroundColor', 'showLogo', 'logoScale', 'showPageNumber', 'footerText', 'footerColor', 'topDecoration', 'bottomDecoration'] as const;
function validatePages(value: unknown, colors: PdfDesignSettings['colors']): PdfDesignSettings['pages'] {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid page design settings.');
  const pages: NonNullable<PdfDesignSettings['pages']> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!pdfPageIds.includes(key as PdfPageId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose a supported PDF page.');
    const page: Record<string, string | number | boolean> = {};
    for (const field of Object.keys(raw)) if (!pageFields.includes(field as typeof pageFields[number])) throw new Error('Unsupported page design control.');
    for (const field of pageFields) {
      const item = (raw as Record<string, unknown>)[field];
      if (item === undefined) continue;
      if (field.endsWith('Font')) {
        if (!pdfFontChoices.some(choice => choice.id === item)) throw new Error('Choose one of the available PDF fonts.');
        if (item !== 'original') page[field] = item as string;
      } else if (field.endsWith('Color') || field === 'accent' || field === 'dark') {
        if (typeof item !== 'string' || !/^#[a-f0-9]{6}$/i.test(item)) throw new Error('Choose valid six-digit page colours.');
        page[field] = item.toUpperCase();
      } else if (field.endsWith('Scale')) {
        const low = field === 'logoScale' ? .7 : .85, high = field === 'logoScale' ? 1.25 : 1.1;
        if (typeof item !== 'number' || !Number.isFinite(item) || item < low || item > high) throw new Error('The size is outside this element’s supported range.');
        if (item !== 1) page[field] = Math.round(item * 1000) / 1000;
      } else if (field === 'footerText') {
        if (typeof item !== 'string' || item.length > 100 || /[\r\n\x00-\x1f]/.test(item)) throw new Error('Use a single footer line of up to 100 characters.');
        if (item.trim()) page[field] = item.trim();
      } else {
        if (typeof item !== 'boolean') throw new Error('Invalid page visibility control.');
        page[field] = item;
      }
    }
    const def = pdfPageDefinition(key), dark = String(page.dark || colors.dark), accent = String(page.accent || colors.accent);
    if (page.topDecoration !== undefined && !def.topDecoration || page.bottomDecoration !== undefined && !def.bottomDecoration) throw new Error(`${def.title}: this artwork control is not available.`);
    if (pdfColorContrast('#FFFFFF', dark) < 4.5 || pdfColorContrast(accent, dark) < 3) throw new Error(`${def.title}: choose a darker deep tone or a clearer accent.`);
    if (page.backgroundColor && !def.paper) throw new Error(`${def.title} uses a photograph rather than a paper background.`);
    const paper = String(page.backgroundColor || '#F4F7F8');
    if (page.backgroundColor && pdfColorContrast('#26211D', paper) < 4.5) throw new Error(`${def.title}: keep the paper light enough for text and tables.`);
    if (page.bodyColor && pdfColorContrast(String(page.bodyColor), paper) < 4.5) throw new Error(`${def.title}: increase the body text contrast.`);
    if (page.lightTextColor && pdfColorContrast(String(page.lightTextColor), dark) < 4.5) throw new Error(`${def.title}: increase the text contrast on dark panels.`);
    if (page.headingColor && pdfColorContrast(String(page.headingColor), def.dark ? dark : paper) < 3) throw new Error(`${def.title}: increase the heading contrast.`);
    if (page.footerColor && pdfColorContrast(String(page.footerColor), def.dark ? dark : paper) < 4.5) throw new Error(`${def.title}: increase the footer contrast.`);
    if (Object.keys(page).length) pages[key as PdfPageId] = page as PdfPageStyle;
  }
  return Object.keys(pages).length ? pages : undefined;
}
export function validatePdfDesign(value: unknown): PdfDesignSettings {
  if (!value || typeof value !== 'object') throw new Error('A PDF design is required.');
  const x = value as Partial<PdfDesignSettings>;
  if (Object.keys(x).some(key => !['schemaVersion', 'theme', 'colors', 'images', 'pages'].includes(key))) throw new Error('Unsupported PDF design setting.');
  if (x.schemaVersion !== 1 || !['original', 'winter'].includes(String(x.theme))) throw new Error('Unsupported PDF design.');
  if (!x.colors || !/^#[a-f0-9]{6}$/i.test(x.colors.accent) || !/^#[a-f0-9]{6}$/i.test(x.colors.dark)) throw new Error('Choose valid six-digit colours.');
  if (Object.keys(x.colors).some(key => !['accent', 'dark'].includes(key))) throw new Error('Unsupported PDF palette colour.');
  const accent = x.colors.accent.toUpperCase(), dark = x.colors.dark.toUpperCase();
  if (1.05 / (luminance(dark) + .05) < 4.5) throw new Error('Choose a darker ink colour so white text remains readable.');
  if ((Math.max(luminance(accent), luminance(dark)) + .05) / (Math.min(luminance(accent), luminance(dark)) + .05) < 3) throw new Error('The accent needs more contrast against the dark colour.');
  if (!x.images || typeof x.images !== 'object' || Array.isArray(x.images)) throw new Error('Invalid design images.');
  const images: PdfDesignSettings['images'] = {};
  for (const [slot, url] of Object.entries(x.images)) {
    if (!pdfImageSlots.some(item => item.id === slot) || !isPdfDesignAssetUrl(url)) throw new Error('Choose an uploaded image for a supported design element.');
    images[slot as PdfImageSlot] = url;
  }
  const pages = validatePages(x.pages, { accent, dark });
  return { schemaVersion: 1, theme: x.theme as PdfThemeId, colors: { accent, dark }, images, ...(pages ? { pages } : {}) };
}
/** A saved design is a snapshot, never a live reference to changing theme defaults. */
export function effectivePdfDesign(input: { pdfTheme?: string; pdfDesign?: PdfDesignSettings }): PdfDesignSettings {
  const theme = resolvePdfTheme(input.pdfTheme).id;
  if (input.pdfDesign?.theme === theme) return validatePdfDesign(input.pdfDesign);
  return defaultPdfDesign(theme);
}
export function samePdfDesign(a: PdfDesignSettings, b: PdfDesignSettings) {
  return a.theme === b.theme && a.colors.accent === b.colors.accent && a.colors.dark === b.colors.dark &&
    pdfImageSlots.every(({ id }) => a.images[id] === b.images[id]) &&
    pdfPageIds.every(id => pageFields.every(field => a.pages?.[id]?.[field] === b.pages?.[id]?.[field]));
}
