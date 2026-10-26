/** Page types follow the native master; repeated itinerary/table pages share their style. */
export const pdfPageIds = ['cover', 'letter', 'summary', 'daywise', 'package', 'hotels', 'inclusions', 'exclusions', 'policies', 'testimonials', 'thanks'] as const;
export type PdfPageId = typeof pdfPageIds[number];
export const pdfFontChoices = [
  { id: 'original', label: 'Original font' }, { id: 'evolventa', label: 'Evolventa · clean' },
  { id: 'redhat', label: 'Red Hat Display · modern' }, { id: 'serif', label: 'Times · editorial' },
] as const;
export type PdfFontChoice = typeof pdfFontChoices[number]['id'];
export type PdfPageStyle = {
  headingFont?: PdfFontChoice; bodyFont?: PdfFontChoice;
  headingColor?: string; bodyColor?: string; lightTextColor?: string;
  headingScale?: number; bodyScale?: number;
  accent?: string; dark?: string; backgroundColor?: string;
  showLogo?: boolean; logoScale?: number;
  showPageNumber?: boolean; footerText?: string; footerColor?: string;
  topDecoration?: boolean; bottomDecoration?: boolean;
};
export type PdfDesignRegion = { id: string; label: string; x: number; y: number; width: number; height: number };
export type PdfDesignPage = {
  id: PdfPageId; title: string; dark: boolean; paper: boolean; topDecoration: boolean; bottomDecoration: boolean; thumbnail: string;
  imageSlots: string[]; regions: PdfDesignRegion[];
};
const region = (id: string, label: string, x: number, y: number, width: number, height: number): PdfDesignRegion => ({ id, label, x, y, width, height });
const descriptors: [PdfPageId, string, boolean, string, string[], [number, number, number, number], [number, number, number, number]][] = [
  ['cover', 'Cover', true, '/pdf-assets/branded-cover.png', ['coverMain', 'coverStrip'], [22, 420, 470, 58], [25, 480, 400, 160]],
  ['letter', 'Welcome letter', true, '/pdf-assets/branded-letter.jpg', ['letter'], [20, 80, 400, 45], [20, 245, 500, 410]],
  ['summary', 'Tour summary', false, '/pdf-assets/branded-summary.jpg', [], [20, 58, 380, 50], [35, 150, 465, 550]],
  ['daywise', 'Day-by-day itinerary', false, '/pdf-assets/standard-daywise.jpg', ['daywise'], [20, 35, 370, 42], [25, 125, 470, 490]],
  ['package', 'Trip investments', false, '/pdf-assets/branded-package.jpg', [], [20, 35, 390, 42], [30, 90, 480, 590]],
  ['hotels', 'Accommodation', false, '/pdf-assets/branded-hotels.jpg', ['hotels'], [20, 80, 450, 85], [30, 190, 480, 525]],
  ['inclusions', 'Inclusions', true, '/pdf-assets/client-inclusions.jpg', ['inclusions'], [20, 72, 460, 52], [35, 130, 460, 570]],
  ['exclusions', 'Exclusions', true, '/pdf-assets/client-exclusions.jpg', ['exclusions'], [20, 72, 460, 52], [35, 130, 460, 570]],
  ['policies', 'Policies', true, '/pdf-assets/branded-policies.jpg', ['policies'], [20, 65, 450, 65], [25, 140, 490, 560]],
  ['testimonials', 'Guest stories', true, '/pdf-assets/branded-testimonials.jpg', ['testimonials'], [20, 60, 450, 70], [25, 140, 490, 560]],
  ['thanks', 'Closing page', false, '/pdf-assets/standard-thanks.jpg', ['thanks1', 'thanks2', 'thanks3', 'thanks4', 'thanks5'], [20, 65, 480, 80], [25, 600, 490, 110]],
];
export const pdfDesignPages: PdfDesignPage[] = descriptors.map(([id, title, dark, thumbnail, imageSlots, heading, body]) => ({
  id, title, dark, paper: ['summary', 'daywise', 'package', 'hotels'].includes(id),
  topDecoration: ['cover', 'daywise', 'package', 'hotels', 'exclusions'].includes(id),
  bottomDecoration: ['summary', 'daywise', 'package', 'hotels'].includes(id), thumbnail, imageSlots,
  regions: [region('header', 'Header & branding', 0, 0, 540, 55), region('heading', 'Page heading', ...heading),
    region('body', 'Text & details', ...body), region('footer', 'Footer & page number', 0, 720, 540, 60)],
}));
export function pdfPageId(key: string): PdfPageId {
  return /^hotels[0-4]?$/.test(key) ? 'hotels' : pdfPageIds.includes(key as PdfPageId) ? key as PdfPageId : 'cover';
}
export function pdfPageDefinition(key: string): PdfDesignPage { return pdfDesignPages.find(page => page.id === pdfPageId(key))!; }
