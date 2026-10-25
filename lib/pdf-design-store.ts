import 'server-only';
import { createHash } from 'node:crypto';
import { initialPdfDesignLibrary, PDF_DESIGN_RECORD_PREFIX, validatePdfDesign, type PdfDesignLibrary, type PdfDesignRecord, type PdfDesignSettings } from '@/lib/pdf-designs';
import type { PdfThemeId } from '@/lib/pdf-themes';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_EDGE = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;
const ASSET_ID = /^[a-f0-9]{64}$/;
const assetPrefix = `${PDF_DESIGN_RECORD_PREFIX}asset_`;
const themeId = (theme: PdfThemeId) => `${PDF_DESIGN_RECORD_PREFIX}design_${theme}__`;
type Row = { id: string; record: unknown };
type StoredDesign = PdfDesignRecord & { kind: 'pdf-design' };
type StoredAsset = { kind: 'pdf-design-asset'; dataUrl: string; name: string; width: number; height: number; mime: 'image/png' | 'image/jpeg' };

export class PdfDesignInputError extends Error {
  constructor(message: string, public status: 400 | 413 = 400) { super(message); }
}
export class PdfDesignConflictError extends Error {
  constructor() { super('This design was changed elsewhere. Reload the saved design before saving your changes.'); }
}
class PdfDesignStoreError extends Error {
  constructor() { super('PDF design storage is temporarily unavailable. Please retry.'); }
}

async function call(path: string, init: RequestInit = {}, retrySafe = false): Promise<unknown> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PdfDesignStoreError();
  try { if (new URL(url).protocol !== 'https:') throw new Error(); } catch { throw new PdfDesignStoreError(); }
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const attempts = !init.method || init.method === 'GET' || retrySafe ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${url}/rest/v1/destination_master${path}`, {
        ...init, headers: { ...headers, ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        if (attempt + 1 < attempts && [408, 425, 429, 500, 502, 503, 504].includes(response.status)) continue;
        throw new PdfDesignStoreError();
      }
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    } catch (error) {
      if (error instanceof PdfDesignStoreError || attempt + 1 === attempts) throw new PdfDesignStoreError();
    }
  }
  throw new PdfDesignStoreError();
}

/** Stream limits apply before parsing; an oversized request is never fully buffered. */
export async function readPdfDesignBody(request: Request, maxBytes: number): Promise<unknown> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new PdfDesignInputError('The upload is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PdfDesignInputError('Request data is required.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new PdfDesignInputError('The upload is too large.', 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof PdfDesignInputError) throw error;
    throw new PdfDesignInputError('Invalid request data.');
  } finally { reader.releaseLock(); }
}

function inputSettings(value: unknown): PdfDesignSettings {
  try { return validatePdfDesign(value); }
  catch (error) { throw new PdfDesignInputError(error instanceof Error ? error.message : 'Invalid PDF design.'); }
}

export async function loadPdfDesignLibrary(): Promise<PdfDesignLibrary> {
  const designs = initialPdfDesignLibrary();
  const rows = await call(`?select=id,record&id=in.(${themeId('original')},${themeId('winter')})&limit=2`) as Row[];
  if (!Array.isArray(rows)) throw new PdfDesignStoreError();
  for (const theme of ['original', 'winter'] as const) {
    const row = rows.find(item => item.id === themeId(theme));
    if (!row) continue;
    const record = row.record as StoredDesign;
    if (record?.kind !== 'pdf-design' || !Number.isSafeInteger(record.revision) || record.revision < 1 || typeof record.updatedAt !== 'string') throw new PdfDesignStoreError();
    let settings;
    try { settings = validatePdfDesign(record.settings); } catch { throw new PdfDesignStoreError(); }
    if (settings.theme !== theme) throw new PdfDesignStoreError();
    designs[theme] = { settings, revision: record.revision, updatedAt: record.updatedAt };
  }
  return designs;
}

export async function savePdfDesign(theme: unknown, value: unknown, revision: unknown): Promise<PdfDesignRecord> {
  if (theme !== 'original' && theme !== 'winter') throw new PdfDesignInputError('Choose a supported PDF theme.');
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || revision >= 1_000_000_000) throw new PdfDesignInputError('Invalid design revision.');
  const settings = inputSettings(value);
  if (settings.theme !== theme) throw new PdfDesignInputError('The selected theme does not match this design.');
  const assetIds = [...new Set(Object.values(settings.images).filter(url => url.startsWith('/api/pdf-design-assets/')).map(url => assetPrefix + url.split('/').at(-1)))];
  if (assetIds.length) {
    const assets = await call(`?select=id&id=in.(${assetIds.join(',')})&record->>kind=eq.pdf-design-asset&limit=16`) as { id: string }[];
    if (!Array.isArray(assets) || assetIds.some(id => !assets.some(asset => asset.id === id))) throw new PdfDesignInputError('An uploaded image is no longer available. Upload it again before saving.');
  }
  const record: StoredDesign = { kind: 'pdf-design', settings, revision: revision + 1, updatedAt: new Date().toISOString() };
  const id = themeId(theme);
  // A conditional PATCH or conflict-ignoring INSERT is the actual comparison.
  // Never use read-then-upsert: two open editors must not silently overwrite.
  const saved = await call(revision === 0 ? '?on_conflict=id' : `?id=eq.${id}&record->>kind=eq.pdf-design&record->>revision=eq.${revision}`, {
    method: revision === 0 ? 'POST' : 'PATCH',
    headers: { Prefer: revision === 0 ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' },
    body: JSON.stringify({ id, record, updated_at: record.updatedAt }),
  }) as Row[];
  if (!Array.isArray(saved)) throw new PdfDesignStoreError();
  if (!saved.some(row => row.id === id)) throw new PdfDesignConflictError();
  return { settings, revision: record.revision, updatedAt: record.updatedAt };
}

function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
    throw new PdfDesignInputError('Use an image up to 4096 pixels per side and 16 megapixels.');
  }
  return { width, height };
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngSize(bytes: Buffer) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new PdfDesignInputError('This is not a valid PNG image.');
  let offset = 8, size: { width: number; height: number } | undefined, hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (end > bytes.length) break;
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) break;
    if (!size) {
      if (kind !== 'IHDR' || length !== 13) break;
      size = dimensions(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) break;
    } else if (kind === 'IHDR' || kind === 'acTL') break; // Static PNG only; no hidden animation frames.
    if (kind === 'IDAT' && length > 0) hasData = true;
    if (kind === 'IEND') {
      if (length === 0 && end === bytes.length && size && hasData) return size;
      break;
    }
    offset = end;
  }
  throw new PdfDesignInputError('This PNG is incomplete or damaged. Please choose another image.');
}
function jpegSize(bytes: Buffer) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new PdfDesignInputError('This is not a valid JPEG image.');
  let offset = 2, size: { width: number; height: number } | undefined;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 11 || bytes[offset + 2] !== 8 || ![1, 3, 4].includes(bytes[offset + 7]) || length !== 8 + 3 * bytes[offset + 7]) break;
      size = dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
    }
    if (marker === 0xda) {
      if (size && length >= 6 && offset + length < bytes.length - 2) return size;
      break;
    }
    offset += length;
  }
  throw new PdfDesignInputError('This JPEG is incomplete or unsupported. Please choose another image.');
}

export function inspectPdfDesignImage(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') throw new PdfDesignInputError('Choose a PNG or JPEG image.');
  if (dataUrl.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) throw new PdfDesignInputError('Use a PNG or JPEG image smaller than 2 MB.', 413);
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new PdfDesignInputError('Choose a PNG or JPEG image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new PdfDesignInputError('Use an image smaller than 2 MB.', 413);
  if (bytes.toString('base64') !== match[2]) throw new PdfDesignInputError('The image encoding is invalid.');
  const mime = match[1] as StoredAsset['mime'];
  const size = mime === 'image/png' ? pngSize(bytes) : jpegSize(bytes);
  return { bytes, mime, ...size, id: createHash('sha256').update(bytes).digest('hex') };
}

export async function savePdfDesignAsset(dataUrl: unknown, suppliedName: unknown) {
  const image = inspectPdfDesignImage(dataUrl);
  const name = typeof suppliedName === 'string' ? suppliedName.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120) : '';
  const record: StoredAsset = { kind: 'pdf-design-asset', dataUrl: dataUrl as string, name: name || 'Uploaded image', width: image.width, height: image.height, mime: image.mime };
  const id = assetPrefix + image.id;
  // Content-addressed objects are append-only. A later upload can never change
  // an image referenced by an already saved itinerary or a different design.
  await call('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id, record, updated_at: new Date().toISOString() }) }, true);
  return { url: `/api/pdf-design-assets/${image.id}`, name: record.name, width: image.width, height: image.height };
}

export async function loadPdfDesignAsset(id: string) {
  if (!ASSET_ID.test(id)) return null;
  const rows = await call(`?select=id,record&id=eq.${assetPrefix}${id}&limit=1`) as Row[];
  if (!Array.isArray(rows)) throw new PdfDesignStoreError();
  const row = rows.find(item => item.id === assetPrefix + id);
  if (!row) return null;
  const record = row.record as StoredAsset;
  if (record?.kind !== 'pdf-design-asset') return null;
  try {
    const image = inspectPdfDesignImage(record.dataUrl);
    if (image.id !== id || image.width !== record.width || image.height !== record.height || image.mime !== record.mime) throw new Error();
    return image;
  } catch { throw new PdfDesignStoreError(); }
}
