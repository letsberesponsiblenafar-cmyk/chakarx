import { PDFDocument } from 'pdf-lib';

export type PdfArtworkPage = { key: string; comparison?: boolean };
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
  // Comparison tables have a different column count from the single-package
  // artwork. Use its native paper and heading, rather than drawing on top of
  // the original two-column table. The zero-row hotel master has clean paper
  // beneath its header, so its embedded crop contains no table or sample copy.
  let comparisonPaper;
  const comparisonHeadings = new Map<string, Awaited<ReturnType<typeof output.embedPage>>>();
  if (artwork.some((page) => page.comparison)) {
    const paperIndex = manifest.hotels0;
    if (!Number.isInteger(paperIndex) || paperIndex < 0 || paperIndex >= master.getPageCount()) throw new Error('The itinerary artwork is missing: hotels0');
    comparisonPaper = await output.embedPage(master.getPage(paperIndex), { left: 0, bottom: 40, right: 540, top: 450 });
    for (const key of new Set(artwork.filter((page) => page.comparison).map((page) => page.key))) {
      const headingHeight = key === 'package' ? 76 : 185;
      comparisonHeadings.set(key, await output.embedPage(master.getPage(manifest[key]), { left: 0, bottom: 780 - headingHeight, right: 540, top: 780 }));
    }
  }
  for (const [index, pageArt] of artwork.entries()) {
    const background = backgrounds.get(pageArt.key)!;
    const { width, height } = overlay.getPage(index).getSize();
    const page = output.addPage([width, height]);
    if (pageArt.comparison && comparisonPaper) {
      page.drawPage(comparisonPaper, { x: 0, y: 0, width, height });
      const heading = comparisonHeadings.get(pageArt.key)!;
      page.drawPage(heading, { x: 0, y: height - heading.height, width, height: heading.height });
    } else page.drawPage(background, { x: 0, y: 0, width, height });
    page.drawPage(foregrounds[index], { x: 0, y: 0, width, height });
  }
  return new Uint8Array(await output.save());
}
