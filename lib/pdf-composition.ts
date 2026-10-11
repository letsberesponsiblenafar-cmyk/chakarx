import { PDFDocument } from 'pdf-lib';

export type PdfArtworkPage = { key: string };
export type PdfMasterManifest = Record<string, number>;

/** Keep the supplied artwork's fonts, paths and original photo streams intact. */
export async function composeVectorClientPdf(
  overlayBytes: ArrayBuffer | Uint8Array,
  masterBytes: ArrayBuffer | Uint8Array,
  artwork: PdfArtworkPage[],
  manifest: PdfMasterManifest,
): Promise<Uint8Array<ArrayBuffer>> {
  const [overlay, master] = await Promise.all([PDFDocument.load(overlayBytes), PDFDocument.load(masterBytes)]);
  if (overlay.getPageCount() !== artwork.length) throw new Error('The itinerary artwork does not match its content pages.');
  const output = await PDFDocument.create();
  output.setTitle('Chakar Experience — Kashmir Itinerary');
  output.setCreator('Chakar Experience');
  output.setProducer('Chakar Experience');
  const keys = [...new Set(artwork.map((page) => page.key))];
  const masterPages = keys.map((key) => {
    const masterIndex = manifest[key];
    if (!Number.isInteger(masterIndex) || masterIndex < 0 || masterIndex >= master.getPageCount()) {
      throw new Error(`The itinerary artwork is missing: ${key}`);
    }
    return master.getPage(masterIndex);
  });
  // One import shares the original fonts, photos and paper texture across
  // backgrounds, rather than duplicating those resources for each page kind.
  const nativeBackgrounds = await output.embedPages(masterPages);
  const foregrounds = await output.embedPages(overlay.getPages());
  const backgrounds = new Map(keys.map((key, index) => [key, nativeBackgrounds[index]]));
  for (const [index, pageArt] of artwork.entries()) {
    const background = backgrounds.get(pageArt.key)!;
    const { width, height } = overlay.getPage(index).getSize();
    const page = output.addPage([width, height]);
    page.drawPage(background, { x: 0, y: 0, width, height });
    page.drawPage(foregrounds[index], { x: 0, y: 0, width, height });
  }
  return new Uint8Array(await output.save());
}
