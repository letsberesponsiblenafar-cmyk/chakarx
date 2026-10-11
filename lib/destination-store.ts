import 'server-only';
import { destinations, enrichDestination, type Destination } from '@/lib/data';
import { initialPackageDefaults, PACKAGE_DEFAULTS_RECORD_ID, validatePackageDefaults, type PackageDefaults } from '@/lib/package-defaults';

type Row = { id: string; record: unknown };
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

export async function listDestinations(): Promise<Destination[]> {
  const rows = await call(`?select=id,record&id=neq.${PACKAGE_DEFAULTS_RECORD_ID}&limit=1000`) as Row[];
  const byId = new Map<string,Destination>(destinations.map((d) => [d.id || d.name, { ...d, id: d.id || d.name }]));
  for (const row of rows) {
    if (row.id === PACKAGE_DEFAULTS_RECORD_ID) continue;
    byId.set(row.id, enrichDestination({ ...(row.record as Destination), id: row.id }));
  }
  return [...byId.values()];
}

export async function saveDestination(destination: Destination) {
  if (destination.id === PACKAGE_DEFAULTS_RECORD_ID) throw new Error('This record is reserved for itinerary-wide package defaults.');
  await call('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: destination.id, record: destination, updated_at: new Date().toISOString() }) });
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
