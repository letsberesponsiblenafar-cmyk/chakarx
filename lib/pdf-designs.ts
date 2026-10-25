import { resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';

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
export function validatePdfDesign(value: unknown): PdfDesignSettings {
  if (!value || typeof value !== 'object') throw new Error('A PDF design is required.');
  const x = value as Partial<PdfDesignSettings>;
  if (x.schemaVersion !== 1 || !['original', 'winter'].includes(String(x.theme))) throw new Error('Unsupported PDF design.');
  if (!x.colors || !/^#[a-f0-9]{6}$/i.test(x.colors.accent) || !/^#[a-f0-9]{6}$/i.test(x.colors.dark)) throw new Error('Choose valid six-digit colours.');
  const accent = x.colors.accent.toUpperCase(), dark = x.colors.dark.toUpperCase();
  if (1.05 / (luminance(dark) + .05) < 4.5) throw new Error('Choose a darker ink colour so white text remains readable.');
  if ((Math.max(luminance(accent), luminance(dark)) + .05) / (Math.min(luminance(accent), luminance(dark)) + .05) < 3) throw new Error('The accent needs more contrast against the dark colour.');
  if (!x.images || typeof x.images !== 'object' || Array.isArray(x.images)) throw new Error('Invalid design images.');
  const images: PdfDesignSettings['images'] = {};
  for (const [slot, url] of Object.entries(x.images)) {
    if (!pdfImageSlots.some(item => item.id === slot) || !isPdfDesignAssetUrl(url)) throw new Error('Choose an uploaded image for a supported design element.');
    images[slot as PdfImageSlot] = url;
  }
  return { schemaVersion: 1, theme: x.theme as PdfThemeId, colors: { accent, dark }, images };
}
/** A saved design is a snapshot, never a live reference to changing theme defaults. */
export function effectivePdfDesign(input: { pdfTheme?: string; pdfDesign?: PdfDesignSettings }): PdfDesignSettings {
  const theme = resolvePdfTheme(input.pdfTheme).id;
  if (input.pdfDesign?.theme === theme) return validatePdfDesign(input.pdfDesign);
  return defaultPdfDesign(theme);
}
export function samePdfDesign(a: PdfDesignSettings, b: PdfDesignSettings) {
  return a.theme === b.theme && a.colors.accent === b.colors.accent && a.colors.dark === b.colors.dark &&
    pdfImageSlots.every(({ id }) => a.images[id] === b.images[id]);
}
