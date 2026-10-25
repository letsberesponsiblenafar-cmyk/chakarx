import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream, type PDFImage } from 'pdf-lib';
import type { PdfDesignSettings, PdfImageSlot } from '@/lib/pdf-designs';

type Rgb = [number, number, number];
type NativePhotoSlot = { id: PdfImageSlot; pages: readonly number[]; path: readonly string[]; width: number; height: number };

// The source photos in these frames sit behind white copy. Keep uploaded
// snow/bright imagery readable without changing any headings or their layout.
const photoScrims: Partial<Record<PdfImageSlot, number>> = {
  coverMain: 0.62, letter: 0.66, inclusions: 0.62, exclusions: 0.62, policies: 0.55, testimonials: 0.6,
};

/** Native image resources, not page-sized overlays. Page indices belong to client-master.json. */
export const pdfMasterPhotoSlots: readonly NativePhotoSlot[] = [
  { id: 'coverMain', pages: [0], path: ['fzFrm0', 'fullpage', 'Fm3', 'Im1'], width: 1245, height: 1314 },
  { id: 'coverStrip', pages: [0], path: ['fzFrm0', 'fullpage', 'Fm4', 'Im1'], width: 1440, height: 558 },
  { id: 'letter', pages: [1], path: ['fzFrm0', 'fullpage', 'Fm1', 'Im1'], width: 1599, height: 1483 },
  { id: 'daywise', pages: [3], path: ['fzFrm0', 'fullpage', 'Im1'], width: 1122, height: 1683 },
  { id: 'hotels', pages: [5, 11, 12, 13, 14], path: ['fzFrm0', 'fullpage', 'Fm1', 'Im1'], width: 2074, height: 1383 },
  { id: 'inclusions', pages: [6], path: ['fzFrm0', 'fullpage', 'X6', 'X4'], width: 640, height: 464 },
  { id: 'exclusions', pages: [7], path: ['fzFrm0', 'fullpage', 'X6', 'X4'], width: 994, height: 663 },
  { id: 'policies', pages: [8], path: ['fzFrm0', 'fullpage', 'Fm3', 'Im1'], width: 2061, height: 1546 },
  { id: 'testimonials', pages: [9], path: ['fzFrm0', 'fullpage', 'Im1'], width: 2496, height: 1664 },
  { id: 'thanks1', pages: [10], path: ['fzFrm0', 'fullpage', 'Fm1', 'Im1'], width: 1402, height: 1868 },
  { id: 'thanks2', pages: [10], path: ['fzFrm0', 'fullpage', 'Fm2', 'Im1'], width: 960, height: 527 },
  { id: 'thanks3', pages: [10], path: ['fzFrm0', 'fullpage', 'Fm3', 'Im1'], width: 994, height: 706 },
  { id: 'thanks4', pages: [10], path: ['fzFrm0', 'fullpage', 'Fm4', 'Im1'], width: 996, height: 950 },
  { id: 'thanks5', pages: [10], path: ['fzFrm0', 'fullpage', 'Fm5', 'Im1'], width: 1031, height: 773 },
];

const originalAccent = '#DEB85B', originalDark = '#3A280D';
const name = (value: string) => PDFName.of(value);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const luminance = ([r, g, b]: readonly number[]) => r * 0.2126 + g * 0.7152 + b * 0.0722;
function hex(value: string): Rgb {
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error('PDF design colours must use six-digit hex values.');
  return [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16)) as Rgb;
}
function originalPalette(settings: Pick<PdfDesignSettings, 'colors'>) {
  return settings.colors.accent.toUpperCase() === originalAccent && settings.colors.dark.toUpperCase() === originalDark;
}

/** Keep neutral ink, white text, photographs and existing blue symbols intact. */
export function mapPdfDesignRgb(color: readonly [number, number, number], settings: Pick<PdfDesignSettings, 'colors'>): Rgb {
  if (originalPalette(settings)) return [...color];
  const [r, g, b] = color;
  // Only the source's warm gold/brown family is a design token. Neutral text
  // and paper must not be indiscriminately colour-filtered or made illegible.
  if (r - b < 24 || g - b < 12 || r < g || g < b) return [...color];
  const accent = hex(settings.colors.accent), dark = hex(settings.colors.dark);
  const low = luminance([58, 40, 13]), high = luminance([222, 184, 91]);
  const weight = clamp((luminance(color) - low) / (high - low));
  return dark.map((channel, index) => Math.round(channel + (accent[index] - channel) * weight)) as Rgb;
}

function bytesToString(bytes: Uint8Array) {
  let output = '';
  for (let start = 0; start < bytes.length; start += 8192) output += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return output;
}

/** Mask PDF strings/comments before looking for graphics operators. */
function operatorMask(source: string) {
  const chars = source.split('');
  let index = 0;
  while (index < source.length) {
    const start = index;
    if (source[index] === '%') {
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index++;
    } else if (source[index] === '(') {
      let depth = 1; index++;
      while (index < source.length && depth) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index] === '(') depth++;
        if (source[index] === ')') depth--;
        index++;
      }
    } else if (source[index] === '<' && source[index + 1] !== '<') {
      index++;
      while (index < source.length && source[index] !== '>') index++;
      index++;
    } else { index += source.slice(index, index + 2) === '<<' ? 2 : 1; continue; }
    for (let cursor = start; cursor < Math.min(index, chars.length); cursor++) chars[cursor] = ' ';
  }
  return chars.join('');
}

function recolorOperators(source: string, settings: PdfDesignSettings) {
  const mask = operatorMask(source);
  const numeric = '([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
  const pattern = new RegExp(`(?<![\\w.])${numeric}\\s+${numeric}\\s+${numeric}\\s+(rg|RG)\\b`, 'g');
  const edits: { start: number; end: number; value: string }[] = [];
  for (const match of mask.matchAll(pattern)) {
    const values: Rgb = [Number(match[1]) * 255, Number(match[2]) * 255, Number(match[3]) * 255];
    const mapped = mapPdfDesignRgb(values, settings);
    if (mapped.every((value, index) => value === values[index])) continue;
    edits.push({ start: match.index!, end: match.index! + match[0].length,
      value: `${mapped.map(value => (value / 255).toFixed(6)).join(' ')} ${match[4]}` });
  }
  let output = source;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  return output;
}

function recolorMaster(document: PDFDocument, settings: PdfDesignSettings) {
  const pageStreams = new Set<PDFRawStream>();
  const collectContents = (contents: unknown) => {
    const value = contents instanceof PDFRef ? document.context.lookup(contents) : contents;
    if (value instanceof PDFRawStream) pageStreams.add(value);
    else if (value instanceof PDFArray) value.asArray().forEach(collectContents);
  };
  document.getPages().forEach(page => collectContents(page.node.get(name('Contents'))));
  // Only page/form content is decoded. Photos, paper textures and fonts retain
  // their original bytes, avoiding the quality loss of a rasterised PDF page.
  for (const [reference, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (!pageStreams.has(object) && object.dict.get(name('Subtype'))?.toString() !== '/Form') continue;
    const source = bytesToString(decodePDFRawStream(object).decode());
    const styled = recolorOperators(source, settings);
    if (styled === source) continue;
    const replacement = document.context.flateStream(Uint8Array.from(styled, character => character.charCodeAt(0)));
    for (const [key, value] of object.dict.entries()) {
      if (!['/Length', '/Filter', '/DecodeParms'].includes(key.toString())) replacement.dict.set(key, value);
    }
    document.context.assign(reference, replacement);
  }
  const visited = new Set<unknown>();
  const visit = (value: unknown) => {
    const object = value instanceof PDFRef ? document.context.lookup(value) : value;
    if (!object || visited.has(object)) return;
    visited.add(object);
    const dictionary = object instanceof PDFRawStream ? object.dict : object;
    if (dictionary instanceof PDFDict) {
      // The master uses RGB exponential gradient functions for its gold/dark
      // tables and ribbons. Include endpoints, otherwise only text changes.
      if (dictionary.lookupMaybe(name('FunctionType'), PDFNumber)?.asNumber() === 2) {
        for (const key of ['C0', 'C1']) {
          const array = dictionary.lookupMaybe(name(key), PDFArray);
          if (array?.size() !== 3) continue;
          const values = array.asArray();
          if (!values.every(entry => entry instanceof PDFNumber)) continue;
          const color = values.map(entry => (entry as PDFNumber).asNumber() * 255) as Rgb;
          // Near-black gradient stops are backgrounds, not body text.
          const mapped = Math.max(...color) < 10 ? hex(settings.colors.dark) : mapPdfDesignRgb(color, settings);
          if (mapped.some((channel, index) => channel !== color[index])) dictionary.set(name(key), document.context.obj(mapped.map(channel => channel / 255)));
        }
      }
      for (const [, child] of dictionary.entries()) visit(child);
    } else if (dictionary instanceof PDFArray) dictionary.asArray().forEach(visit);
  };
  for (const [, object] of document.context.enumerateIndirectObjects()) visit(object);
}

function photoResource(document: PDFDocument, slot: NativePhotoSlot, pageIndex: number) {
  let container: PDFDict = document.getPage(pageIndex).node;
  for (const [index, segment] of slot.path.entries()) {
    const resources = container.lookupMaybe(name('Resources'), PDFDict);
    const objects = resources?.lookupMaybe(name('XObject'), PDFDict);
    const resource = objects?.lookup(name(segment));
    if (!objects || !(resource instanceof PDFRawStream)) throw new Error(`PDF image slot ${slot.id} is missing from the original artwork.`);
    if (index === slot.path.length - 1) {
      const width = resource.dict.lookupMaybe(name('Width'), PDFNumber)?.asNumber();
      const height = resource.dict.lookupMaybe(name('Height'), PDFNumber)?.asNumber();
      if (resource.dict.get(name('Subtype'))?.toString() !== '/Image' || width !== slot.width || height !== slot.height) {
        throw new Error(`PDF image slot ${slot.id} no longer matches the original artwork. Please update the design template.`);
      }
      return { dictionary: objects, key: name(segment) };
    }
    container = resource.dict;
  }
  throw new Error(`PDF image slot ${slot.id} is not configured.`);
}

/** Apply design tokens inside the supplied native master; never reconstruct its layout. */
export async function stylePdfMaster(
  masterBytes: ArrayBuffer | Uint8Array,
  settings: PdfDesignSettings,
  resolvedImages: Partial<Record<PdfImageSlot, string>> = {},
): Promise<Uint8Array<ArrayBuffer>> {
  hex(settings.colors.accent); hex(settings.colors.dark);
  const photos = Object.entries(resolvedImages).filter(([, value]) => value !== undefined && value !== '');
  const known = new Set<string>([...pdfMasterPhotoSlots.map(slot => slot.id), 'logoLight', 'logoDark']);
  if (photos.some(([id]) => !known.has(id))) throw new Error('This PDF design includes an unsupported image slot.');
  const active = pdfMasterPhotoSlots.filter(slot => resolvedImages[slot.id]);
  if (originalPalette(settings) && !active.length) return new Uint8Array(masterBytes instanceof Uint8Array ? masterBytes : masterBytes.slice(0));
  const document = await PDFDocument.load(masterBytes);
  if (document.getPageCount() !== 15) throw new Error('The original PDF design master does not match this editor.');
  // Resolve every target before replacing resources: the hotel row variants
  // intentionally share their original photo resource dictionaries.
  const targets = active.map(slot => ({ slot, resources: slot.pages.map(page => photoResource(document, slot, page)) }));
  if (!originalPalette(settings)) recolorMaster(document, settings);
  const embeddedImages = new Map<string, PDFImage>();
  for (const { slot, resources } of targets) {
    const imageData = resolvedImages[slot.id]!;
    const match = /^data:image\/(png|jpeg|jpg);base64,/i.exec(imageData);
    if (!match) throw new Error(`Choose a PNG or JPEG image for ${slot.id}.`);
    let image = embeddedImages.get(imageData);
    try {
      if (!image) {
        image = match[1].toLowerCase() === 'png' ? await document.embedPng(imageData) : await document.embedJpg(imageData);
        embeddedImages.set(imageData, image);
      }
    }
    catch { throw new Error(`The image for ${slot.id} could not be read. Choose a valid PNG or JPEG.`); }
    const sourceRatio = slot.width / slot.height, replacementRatio = image.width / image.height;
    const scaleX = Math.max(1, replacementRatio / sourceRatio), scaleY = Math.max(1, sourceRatio / replacementRatio);
    const imageTransform = [scaleX, 0, 0, scaleY, (1 - scaleX) / 2, (1 - scaleY) / 2].map(value => Number(value.toFixed(8))).join(' ');
    const scrim = photoScrims[slot.id] || 0;
    const ink = hex(settings.colors.dark).map(channel => (channel / 255 * 0.3).toFixed(6)).join(' ');
    // Image Do operators use a unit square. A clipped unit Form preserves the
    // exact source framing while giving uploads a centred cover crop.
    const frame = document.context.flateStream(`q\n0 0 1 1 re W n\nq\n${imageTransform} cm\n/Photo Do\nQ\n${scrim ? `/Readability gs\n${ink} rg\n0 0 1 1 re f\n` : ''}Q\n`, {
      Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 1, 1],
      Resources: { XObject: { Photo: image.ref }, ...(scrim ? { ExtGState: { Readability: { Type: 'ExtGState', ca: scrim } } } : {}) },
    });
    const reference = document.context.register(frame);
    resources.forEach(({ dictionary, key }) => dictionary.set(key, reference));
  }
  return new Uint8Array(await document.save());
}
