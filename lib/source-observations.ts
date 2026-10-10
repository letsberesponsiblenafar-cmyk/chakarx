import 'server-only';
import { createHash } from 'node:crypto';
import { sources } from '@/lib/data';

export type SourceObservation = { source_id: string; url: string; status: number; retrieved_at: string; content_hash: string | null; detail: string };
const projectUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const projectKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function database(path: string, init: RequestInit = {}) {
  if (!projectUrl || !projectKey) throw new Error('Source history needs the Supabase connection.');
  const parsed = new URL(projectUrl);
  if (parsed.protocol !== 'https:') throw new Error('SUPABASE_URL must be an HTTPS project URL.');
  const headers: Record<string, string> = { apikey: projectKey, 'Content-Type': 'application/json' };
  if (!projectKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${projectKey}`;
  const response = await fetch(`${projectUrl}/rest/v1/source_observations${path}`, { ...init, headers: { ...headers, ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Source history database failed (${response.status}): ${(await response.text()).slice(0, 160)}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function latestSourceObservations(): Promise<SourceObservation[]> {
  const rows = await database('?select=source_id,url,status,retrieved_at,content_hash,detail&order=retrieved_at.desc&limit=1000') as SourceObservation[];
  const latest = new Map<string, SourceObservation>();
  for (const row of rows) if (!latest.has(row.source_id)) latest.set(row.source_id, row);
  return [...latest.values()];
}

export async function checkAndRecordSource(index: number): Promise<SourceObservation> {
  const source = sources[index];
  if (!source) throw new Error('Unknown source.');
  const retrieved_at = new Date().toISOString();
  let status = 0;
  let content_hash: string | null = null;
  let detail = '';
  try {
    const response = await fetch(source.url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Chakar-Experience-Source-Check/2.0' } });
    status = response.status;
    const body = await response.arrayBuffer();
    content_hash = createHash('sha256').update(Buffer.from(body)).digest('hex');
    detail = `HTTP ${status}; ${body.byteLength} bytes. Page reachability only; destination facts and provider inventory are not verified.`;
  } catch (error) {
    detail = error instanceof Error ? error.message.slice(0, 300) : 'Source could not be reached.';
  }
  const observation = { source_id: source.name, url: source.url, status, retrieved_at, content_hash, detail };
  await database('', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(observation) });
  return observation;
}
