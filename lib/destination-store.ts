import 'server-only';
import { destinations, type Destination } from '@/lib/data';

type Row = { id: string; record: Destination };
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
  const rows = await call('?select=id,record&limit=1000') as Row[];
  const byId = new Map<string,Destination>(destinations.map((d) => [d.id || d.name, { ...d, id: d.id || d.name }]));
  for (const row of rows) byId.set(row.id, { ...row.record, id: row.id });
  return [...byId.values()];
}

export async function saveDestination(destination: Destination) {
  await call('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: destination.id, record: destination, updated_at: new Date().toISOString() }) });
}
