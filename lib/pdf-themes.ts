/** Published PDF designs. The same catalogue powers trip selection and export. */
export type PdfThemeId = 'original' | 'winter';

export type PdfTheme = {
  id: PdfThemeId;
  name: string;
  version: number;
  description: string;
  preview: string;
  coverArtwork: string;
};

export const pdfThemes: readonly PdfTheme[] = [
  { id: 'original', name: 'Original', version: 1,
    description: 'The familiar Chakar design, with warm colours and classic layouts.',
    preview: '/pdf-assets/branded-cover.png', coverArtwork: '/pdf-assets/branded-cover.png' },
  { id: 'winter', name: 'Winter', version: 1,
    description: 'Snowy landscapes, cool blue tones and a spacious editorial layout.',
    preview: '/pdf-assets/winter/winter-preview.jpg', coverArtwork: '/pdf-assets/winter/winter-cover.jpg' },
];

/** Older trips and unsupported imported values retain the established design. */
export function resolvePdfTheme(id?: string): PdfTheme {
  return pdfThemes.find(theme => theme.id === id) || pdfThemes[0];
}
