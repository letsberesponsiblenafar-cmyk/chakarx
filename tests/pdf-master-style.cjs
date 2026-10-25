/* The design editor changes native artwork resources, never the page layout. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { PDFDocument, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFArray, decodePDFRawStream } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, filename);
};
const { stylePdfMaster, mapPdfDesignRgb, pdfMasterPhotoSlots } = require('../lib/pdf-master-style.ts');
const original = { schemaVersion: 1, theme: 'original', colors: { accent: '#DEB85B', dark: '#3A280D' }, images: {} };
const winter = { schemaVersion: 1, theme: 'winter', colors: { accent: '#91B8CB', dark: '#19384B' }, images: {} };
const source = new Uint8Array(fs.readFileSync(path.join(root, 'public/pdf-assets/client-master.pdf')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const name = value => PDFName.of(value);
function resource(document, slot, index = 0) {
  let dictionary = document.getPage(slot.pages[index]).node;
  for (const segment of slot.path) {
    const stream = dictionary.lookup(name('Resources'), PDFDict).lookup(name('XObject'), PDFDict).lookup(name(segment), PDFRawStream);
    dictionary = stream.dict;
    if (segment === slot.path.at(-1)) return stream;
  }
}
function nativeResources(document) {
  return document.context.enumerateIndirectObjects().flatMap(([ref, value]) => {
    if (!(value instanceof PDFRawStream)) return [];
    const kind = value.dict.get(name('Subtype'))?.toString();
    if (kind === '/Image') return [[ref.toString(), hash(value.getContents())]];
    if (value.dict.has(name('Length1'))) return [[ref.toString(), hash(value.getContents())]];
    return [];
  });
}
async function text(bytes) {
  const reader = new PDFParse({ data: new Uint8Array(bytes) });
  try { return (await reader.getText()).text; } finally { await reader.destroy(); }
}
async function main() {
  const untouched = await stylePdfMaster(source, original);
  assert.equal(hash(untouched), hash(source), 'Original with default settings must remain byte-for-byte unchanged');
  assert.deepEqual(mapPdfDesignRgb([222, 184, 91], original), [222, 184, 91]);
  for (const color of [[255, 255, 255], [0, 0, 0], [38, 38, 38], [30, 106, 201]]) {
    assert.deepEqual(mapPdfDesignRgb(color, winter), color, 'Neutral ink/white/blue symbols are not global colour-filtered');
  }
  assert.deepEqual(mapPdfDesignRgb([222, 184, 91], winter), [145, 184, 203]);
  assert.deepEqual(mapPdfDesignRgb([58, 40, 13], winter), [25, 56, 75]);
  console.log('PASS Original is byte-for-byte unchanged; only warm design tokens map into the selected palette');

  const before = await PDFDocument.load(source);
  const styled = await stylePdfMaster(source, winter);
  const after = await PDFDocument.load(styled);
  assert.equal(after.getPageCount(), before.getPageCount());
  assert.deepEqual(after.getPages().map(page => page.getSize()), before.getPages().map(page => page.getSize()));
  assert.deepEqual(nativeResources(after), nativeResources(before), 'Every original photograph, paper texture and font stream is preserved');
  assert.equal(await text(styled), await text(source), 'Master headings, approved copy and native text positions must stay intact');
  let changedStreams = 0, gradients = 0;
  for (const [ref, object] of before.context.enumerateIndirectObjects()) {
    const other = after.context.lookup(ref);
    if (object instanceof PDFRawStream && object.dict.get(name('Subtype'))?.toString() === '/Form') {
      const oldContent = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
      const newContent = Buffer.from(decodePDFRawStream(other).decode()).toString('latin1');
      if (oldContent !== newContent) {
        changedStreams++;
        const rgb = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d*)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d*)?|\.\d+)\s+(?:rg|RG)\b/g;
        assert.equal(newContent.replace(rgb, 'RGB'), oldContent.replace(rgb, 'RGB'), 'Geometry, font operators and glyphs must not change');
      }
    }
    if (object instanceof PDFDict && object.lookupMaybe(name('FunctionType'), PDFNumber)?.asNumber() === 2) {
      const first = object.lookupMaybe(name('C0'), PDFArray), second = other.lookupMaybe(name('C0'), PDFArray);
      if (first && second && first.toString() !== second.toString()) gradients++;
    }
  }
  assert.ok(changedStreams > 10, 'Expected native vector colour operators to change');
  assert.ok(gradients > 0, 'The gold/dark gradient stops must follow the chosen palette too');
  console.log('PASS Winter retains all source pages, exact geometry, fonts, copy and photo streams while recolouring vector fills and gradients');

  const artwork = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'public/pdf-assets/winter/winter-cover.jpg')).toString('base64');
  const allPhotos = Object.fromEntries(pdfMasterPhotoSlots.map(slot => [slot.id, artwork]));
  const imagesOnly = await stylePdfMaster(source, original, allPhotos);
  const replacement = await PDFDocument.load(imagesOnly);
  for (const slot of pdfMasterPhotoSlots) for (let index = 0; index < slot.pages.length; index++) {
    const frame = resource(replacement, slot, index);
    assert.equal(frame.dict.get(name('Subtype')).toString(), '/Form', `${slot.id} should be an independently editable photo frame`);
    assert.equal(frame.dict.lookup(name('BBox'), PDFArray).toString(), '[ 0 0 1 1 ]');
    const ops = Buffer.from(decodePDFRawStream(frame).decode()).toString('ascii');
    assert.match(ops, /0 0 1 1 re W n/, 'Crop must clip to the original image frame');
    const matrix = ops.match(/([-\d.]+) 0 0 ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/);
    assert.ok(matrix);
    assert.ok(Number(matrix[1]) >= 1 && Number(matrix[2]) >= 1, 'Replacement covers the frame without stretching');
    assert.ok(Math.abs(Number(matrix[1]) / Number(matrix[2]) - (1024 / 1536) / (slot.width / slot.height)) < 1e-7, 'Upload aspect ratio is maintained within the original frame');
  }
  assert.equal(await text(imagesOnly), await text(source), 'Replacing artwork must retain captions, copy and layout');
  console.log('PASS Every photo slot is replaced inside its original frame, with centred cover crop; all hotel row variants remain consistent');

  const onePhoto = await PDFDocument.load(await stylePdfMaster(source, original, { coverMain: artwork }));
  assert.equal(resource(onePhoto, pdfMasterPhotoSlots[0]).dict.get(name('Subtype')).toString(), '/Form');
  assert.equal(resource(onePhoto, pdfMasterPhotoSlots[1]).dict.get(name('Subtype')).toString(), '/Image', 'Editing cover main must not change cover strip');
  await assert.rejects(() => stylePdfMaster(source, winter, { coverMain: 'https://example.invalid/photo.jpg' }), /PNG or JPEG/);
  await assert.rejects(() => stylePdfMaster(source, winter, { coverMain: 'data:image/jpeg;base64,bm90LWltYWdl' }), /could not be read/);
  await assert.rejects(() => stylePdfMaster(source, { ...winter, colors: { ...winter.colors, accent: 'red' } }), /six-digit/);
  await assert.rejects(() => stylePdfMaster(source, winter, { unknown: artwork }), /unsupported/);
  console.log('PASS Slots are independent and malformed images/colours fail clearly without silently losing artwork');

  const out = path.join(root, 'tmp/pdfs'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'native-winter-master.pdf'), styled);
  fs.writeFileSync(path.join(out, 'native-winter-photo-master.pdf'), await stylePdfMaster(source, winter, { coverMain: artwork, coverStrip: artwork, letter: artwork, daywise: artwork }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
