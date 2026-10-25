import 'server-only';
import { destinations, enrichDestination, type Destination } from '@/lib/data';
import { initialPackageDefaults, PACKAGE_DEFAULTS_RECORD_ID, validatePackageDefaults, type PackageDefaults } from '@/lib/package-defaults';
import { PDF_DESIGN_RECORD_PREFIX } from '@/lib/pdf-designs';

type Row = { id: string; record: unknown };
type DeletedDestination = Destination & { kind: 'deleted-destination'; deleted_at: string };
function isDeletedDestination(record: unknown): record is DeletedDestination {
  return Boolean(record && typeof record === 'object' && (record as { kind?: unknown }).kind === 'deleted-destination');
}
export class DestinationDeletedError extends Error {
  constructor() { super('This destination has been deleted. Return to the destination library.'); }
}
const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export function destinationStoreConfigured() { return Boolean(url && key); }

async function call(path: string, init: RequestInit = {}) {
  if (!url || !key) throw new Error('Destination database is not configured.');
  try { if (new URL(url).protocol !== 'https:') throw new Error(); }
  catch { throw new Error('SUPABASE_URL must be a valid HTTPS project URL.'); }
  const headers: Record<string,string> = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/destination_master${path}`, {
    ...init, headers: { ...headers, ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Destination database request failed (${response.status}): ${(await response.text()).slice(0, 180)}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function loadDestinationCatalog(): Promise<{ destinations: Destination[]; archivedDestinations: Destination[] }> {
  // Escape underscores in LIKE: these are literal reserved IDs, not arbitrary
  // wildcard matches. Exclude large immutable image records at the database.
  const pdfPrefix = encodeURIComponent(PDF_DESIGN_RECORD_PREFIX.replace(/_/g, '\\_'));
  const rows = await call(`?select=id,record&id=neq.${PACKAGE_DEFAULTS_RECORD_ID}&id=not.like.${pdfPrefix}*&limit=1000`) as Row[];
  const byId = new Map<string,Destination>(destinations.map((d) => [d.id || d.name, { ...d, id: d.id || d.name }]));
  const archivedDestinations: Destination[] = [];
  for (const row of rows) {
    if (row.id === PACKAGE_DEFAULTS_RECORD_ID || row.id.startsWith(PDF_DESIGN_RECORD_PREFIX)) continue;
    if (isDeletedDestination(row.record)) {
      byId.delete(row.id);
      archivedDestinations.push(enrichDestination({ ...row.record, id: row.id }));
      continue;
    }
    byId.set(row.id, enrichDestination({ ...(row.record as Destination), id: row.id }));
  }
  return { destinations: [...byId.values()], archivedDestinations };
}

export async function listDestinations(): Promise<Destination[]> {
  return (await loadDestinationCatalog()).destinations;
}

export async function listArchivedDestinations(): Promise<Destination[]> {
  return (await loadDestinationCatalog()).archivedDestinations;
}

function validateRecordId(id?: string) {
  if (!id || id.length > 100 || id.trim() !== id) throw new Error('A valid destination ID is required.');
  if (id === PACKAGE_DEFAULTS_RECORD_ID) throw new Error('This record is reserved for itinerary-wide package defaults.');
  if (id.startsWith(PDF_DESIGN_RECORD_PREFIX)) throw new Error('This record is reserved for PDF designs.');
}

export async function saveDestination(destination: Destination) {
  validateRecordId(destination.id);
  const rows = await call(`?select=id,record&id=eq.${encodeURIComponent(destination.id!)}&limit=1`) as Row[];
  if (rows.some((row) => row.id === destination.id && isDeletedDestination(row.record))) throw new DestinationDeletedError();
  const existing = rows.some((row) => row.id === destination.id);
  // Check at write time as well: a simultaneous delete must win over a stale
  // edit. A missing row can be inserted, but never overwrite a new tombstone.
  const saved = await call(existing
    ? `?id=eq.${encodeURIComponent(destination.id!)}&record->>kind=is.null`
    : '?on_conflict=id', {
    method: existing ? 'PATCH' : 'POST',
    headers: { Prefer: existing ? 'return=representation' : 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id: destination.id, record: destination, updated_at: new Date().toISOString() }),
  }) as Row[];
  if (!saved?.some((row) => row.id === destination.id)) throw new DestinationDeletedError();
}

export async function deleteDestination(destination: Destination) {
  const id = destination.id || destination.name;
  validateRecordId(id);
  const deleted_at = new Date().toISOString();
  // Keep a tombstone over bundled records, otherwise a deleted built-in guide
  // would return on the next refresh. Its content also supports existing quotes.
  const record: DeletedDestination = { ...destination, id, kind: 'deleted-destination', deleted_at };
  await call('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, record, updated_at: deleted_at }) });
}

export async function loadPackageDefaults(): Promise<PackageDefaults> {
  const rows = await call(`?select=id,record&id=eq.${PACKAGE_DEFAULTS_RECORD_ID}&limit=1`) as Row[];
  const row = rows.find((item) => item.id === PACKAGE_DEFAULTS_RECORD_ID);
  return row ? validatePackageDefaults(row.record) : initialPackageDefaults();
}

export async function savePackageDefaults(defaults: PackageDefaults) {
  const record = validatePackageDefaults(defaults);
  await call('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: PACKAGE_DEFAULTS_RECORD_ID, record: { kind: 'package-defaults', ...record }, updated_at: new Date().toISOString() }) });
  return record;
}
