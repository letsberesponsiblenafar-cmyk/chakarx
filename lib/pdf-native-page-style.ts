import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFFont, PDFName, PDFNumber, PDFRawStream, StandardFonts, decodePDFRawStream, rgb } from 'pdf-lib';
import { pdfPageDefinition, type PdfPageId, type PdfPageStyle, type PdfFontChoice } from '@/lib/pdf-design-pages';
import type { PdfFonts } from '@/lib/pdf-types';

const name = PDFName.of;
const number = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const content = (stream: PDFRawStream) => {
  const bytes = decodePDFRawStream(stream).decode(); let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return text;
};
function replaceStream(doc: PDFDocument, source: PDFRawStream, text: string) {
  const replacement = doc.context.flateStream(Uint8Array.from(text, char => char.charCodeAt(0)));
  for (const [key, value] of source.dict.entries()) if (!['/Length', '/Filter', '/DecodeParms'].includes(key.toString())) replacement.dict.set(key, value);
  return replacement;
}
function hexRgb(value: string) { return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255); }
function unicode(hex: string) { let output = ''; for (let i = 0; i < hex.length; i += 4) output += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return output; }
function fontMap(font: PDFDict): Map<number, string> {
  const stream = font.lookup(name('ToUnicode'));
  if (!(stream instanceof PDFRawStream)) throw new Error('This template font has no Unicode map. Restore its original font.');
  const source = content(stream), map = new Map<number, string>();
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(parseInt(pair[1], 16), unicode(pair[2]));
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(<([\da-f]+)>|\[([^\]]+)\])/gi)) {
      const from = parseInt(range[1], 16), to = parseInt(range[2], 16);
      if (to - from > 65535) throw new Error('The template font map is invalid.');
      const list = range[5]?.match(/<([\da-f]+)>/gi);
      for (let code = from; code <= to; code++) {
        map.set(code, list ? unicode(list[code - from]?.slice(1, -1) || '') : unicode((parseInt(range[4], 16) + code - from).toString(16).padStart(range[4].length, '0')));
      }
    }
  }
  return map;
}
function glyphWidth(font: PDFDict, code: number) {
  const descendant = font.lookupMaybe(name('DescendantFonts'), PDFArray)?.lookupMaybe(0, PDFDict);
  const widths = descendant?.lookupMaybe(name('W'), PDFArray);
  if (widths) for (let i = 0; i < widths.size();) {
    const start = widths.lookup(i++, PDFNumber).asNumber();
    const entry = widths.lookup(i++);
    if (entry instanceof PDFArray) {
      if (code >= start && code < start + entry.size()) return entry.lookup(code - start, PDFNumber).asNumber();
    } else if (entry instanceof PDFNumber) {
      const width = widths.lookup(i++, PDFNumber).asNumber();
      if (code >= start && code <= entry.asNumber()) return width;
    }
  }
  return descendant?.lookupMaybe(name('DW'), PDFNumber)?.asNumber() ?? 1000;
}
/** Text colours inherit through q/Q; strings are masked before reading operators. */
function fillAt(source: string, end: number, fallback: number[]): number[] {
  const clean = source.slice(0, end).replace(/BT[\s\S]*?ET/g, '').replace(/<[^>]*>|\([^)]*\)|%[^\r\n]*/g, ' ');
  const pattern = new RegExp(`(${number})\\s+(${number})\\s+(${number})\\s+rg\\b|(${number})\\s+g\\b|(?<![\\w/])[qQ]\\b`, 'g');
  let fill = fallback; const stack: number[][] = [];
  for (const match of clean.matchAll(pattern)) {
    if (match[0] === 'q') stack.push(fill);
    else if (match[0] === 'Q') fill = stack.pop() || fallback;
    else if (match[4] !== undefined) fill = Array(3).fill(Number(match[4]));
    else fill = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  return fill;
}
export function nativeTextRole(fontName: string, size: number): 'heading' | 'body' {
  return size >= 20 && (/TheSeasons/.test(fontName) || /Evolventa-Oblique/.test(fontName) && size >= 30) ? 'heading' : 'body';
}

/** Operates on an isolated page copy; shared master resources can never leak overrides into other pages. */
export async function styleNativePage(doc: PDFDocument, id: PdfPageId, style: PdfPageStyle, fonts?: PdfFonts) {
  const definition = pdfPageDefinition(id), embedded = new Map<string, PDFFont>(), maps = new Map<PDFDict, Map<number, string>>();
  doc.registerFontkit(fontkit);
  async function chosenFont(choice: PdfFontChoice, bold: boolean) {
    const key = `${choice}_${bold ? 'bold' : 'normal'}`;
    if (!embedded.has(key)) {
      let font: PDFFont;
      if (choice === 'serif') font = await doc.embedFont(bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman);
      else {
        if (!fonts) throw new Error('The selected PDF fonts could not be loaded. Please retry.');
        const bytes = choice === 'redhat' ? (bold ? fonts.redhatBold || fonts.cover : fonts.cover) : (bold ? fonts.bold : fonts.regular);
        font = await doc.embedFont(bytes, { subset: true });
      }
      embedded.set(key, font);
    }
    return { key: `Chakar_${key}`, font: embedded.get(key)! };
  }
  let paper: PDFRawStream | undefined;
  const originalObjects = [...doc.context.enumerateIndirectObjects()];
  for (const [reference, object] of originalObjects) {
    if (!(object instanceof PDFRawStream)) continue;
    const width = object.dict.lookupMaybe(name('Width'), PDFNumber)?.asNumber(), height = object.dict.lookupMaybe(name('Height'), PDFNumber)?.asNumber();
    if (object.dict.get(name('Subtype'))?.toString() === '/Image') {
      if (width === 900 && height === 1300 && definition.paper) {
        paper = object;
        if (style.backgroundColor) {
          const color = hexRgb(style.backgroundColor).join(' ');
          doc.context.assign(reference, doc.context.flateStream(`${color} rg 0 0 1 1 re f`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1] }));
        }
      }
      if (style.topDecoration === false && width === 74 && height === 12) doc.context.assign(reference, doc.context.flateStream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1] }));
      continue;
    }
    if (object.dict.get(name('Subtype'))?.toString() !== '/Form') continue;
    const resources = object.dict.lookupMaybe(name('Resources'), PDFDict), fontResources = resources?.lookupMaybe(name('Font'), PDFDict);
    if (!fontResources) continue;
    const source = content(object), edits: { start: number; end: number; value: string }[] = [];
    for (const match of source.matchAll(/\bBT\b[\s\S]*?\bET\b/g)) {
      const block = match[0], tf = new RegExp(`/([\\w]+)\\s+(${number})\\s+Tf`).exec(block);
      if (!tf) continue;
      const oldFont = fontResources.lookupMaybe(name(tf[1]), PDFDict);
      if (!oldFont) continue;
      const fontName = oldFont.get(name('BaseFont'))?.toString() || '', size = Number(tf[2]), role = nativeTextRole(fontName, size);
      const choice = style[role === 'heading' ? 'headingFont' : 'bodyFont'];
      const scale = style[role === 'heading' ? 'headingScale' : 'bodyScale'] ?? 1;
      const fill = fillAt(source, match.index!, definition.dark ? [1, 1, 1] : [0, 0, 0]);
      const color = role === 'heading' && style.headingColor ? style.headingColor : Math.min(...fill) > .8 ? style.lightTextColor : style.bodyColor;
      if ((!choice || choice === 'original') && scale === 1 && !color) continue;
      let changed = block;
      if (choice && choice !== 'original') {
        // The native template positions every glyph explicitly. Merge each
        // single-line text object and fit its replacement to the same advance.
        const tm = new RegExp(`(${number}\\s+${number}\\s+${number}\\s+${number}\\s+${number}\\s+${number})\\s+Tm`).exec(block);
        const runs = [...block.matchAll(/<([\da-f]+)>\s*Tj/gi)];
        if (!tm || !runs.length || (block.match(/\bTm\b/g) || []).length !== 1 || /\bTJ\b/.test(block)) throw new Error(`${definition.title}: this text cannot safely use another font.`);
        if (!maps.has(oldFont)) maps.set(oldFont, fontMap(oldFont));
        const map = maps.get(oldFont)!; let text = '', lastCode = 0;
        for (const run of runs) for (let i = 0; i < run[1].length; i += 4) {
          lastCode = parseInt(run[1].slice(i, i + 4), 16);
          const char = map.get(lastCode);
          if (char === undefined) throw new Error(`${definition.title}: a template character could not be decoded.`);
          text += char;
        }
        const movements = [...block.matchAll(new RegExp(`(${number})\\s+(${number})\\s+T[dD]`, 'g'))];
        if (movements.some(m => Number(m[2]) !== 0)) throw new Error(`${definition.title}: multiline text needs its original font.`);
        const oldWidth = movements.reduce((sum, m) => sum + Number(m[1]), 0) + glyphWidth(oldFont, lastCode) / 1000 * size;
        const selected = await chosenFont(choice, /Bold|-Bd/.test(fontName));
        fontResources.set(name(selected.key), selected.font.ref);
        // Built-in Times uses WinAnsi. Preserve actual meaning while making
        // native special-space/dash typography representable in that preset.
        if (choice === 'serif') text = text.replace(/[\u2000-\u200b\u202f]/g, ' ').replace(/\u2011/g, '-');
        const newWidth = selected.font.widthOfTextAtSize(text, size * scale);
        const horizontal = newWidth ? oldWidth / newWidth * 100 : 100;
        changed = `BT /${selected.key} ${(size * scale).toFixed(5)} Tf ${tm[1]} Tm ${horizontal.toFixed(5)} Tz ${selected.font.encodeText(text).toString()} Tj ET`;
      } else if (scale !== 1) changed = block.replace(tf[0], `/${tf[1]} ${(size * scale).toFixed(5)} Tf ${(100 / scale).toFixed(5)} Tz`);
      edits.push({ start: match.index!, end: match.index! + block.length, value: `q ${color ? `${hexRgb(color).join(' ')} rg ` : ''}${changed} Q` });
    }
    let result = source;
    for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
    if (result !== source) doc.context.assign(reference, replaceStream(doc, object, result));
  }
  if (style.bottomDecoration === false && definition.bottomDecoration && paper) {
    const page = doc.getPage(0);
    if (style.backgroundColor) { const c = hexRgb(style.backgroundColor); page.drawRectangle({ x: 0, y: 0, width: 540, height: 60, color: rgb(c[0], c[1], c[2]) }); }
    else {
      const paperRef = doc.context.register(paper);
      const cleanFooter = doc.context.flateStream('q 0 0 540 60 re W n 540 0 0 780 0 0 cm /Paper Do Q', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 540, 780], Resources: { XObject: { Paper: paperRef } } });
      const resources = page.node.Resources()!, objects = resources.lookupMaybe(name('XObject'), PDFDict) || doc.context.obj({});
      resources.set(name('XObject'), objects); objects.set(name('ChakarCleanFooter'), doc.context.register(cleanFooter));
      page.node.addContentStream(doc.context.register(doc.context.flateStream('q /ChakarCleanFooter Do Q')));
    }
  }
}
