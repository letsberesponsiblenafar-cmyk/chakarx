import 'server-only';
import type { ItinerarySnapshot } from '@/components/PlannerProvider';

export type SavedItinerarySummary = {
  id: string;
  client_name: string;
  arrival: string | null;
  departure: string | null;
  days: number;
  nights: number;
  package_total: number;
  created_at: string;
  updated_at: string;
  last_downloaded_at: string | null;
  download_count: number;
};
export type SavedItinerary = SavedItinerarySummary & { snapshot: ItinerarySnapshot };

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export function itineraryStoreConfigured() { return Boolean(url && key); }

async function call(path: string, init: RequestInit = {}) {
  if (!url || !key) throw new Error('The saved itinerary database is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw new Error(); }
  catch { throw new Error('SUPABASE_URL must be the project URL, for example https://project.supabase.co.'); }
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const read = !(init.method && init.method !== 'GET');
  for (let attempt = 0; attempt < (read ? 2 : 1); attempt++) {
    try {
      const response = await fetch(`${url}/rest/v1/saved_itineraries${path}`, { ...init, headers: { ...headers, ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        if (read && attempt === 0 && [429, 502, 503, 504].includes(response.status)) { await new Promise((resolve) => setTimeout(resolve, 350)); continue; }
        const detail = (await response.text()).slice(0, 240);
        throw new Error(`Saved itineraries request failed (${response.status}): ${detail}`);
      }
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    } catch (error) {
      if (!read || attempt > 0 || error instanceof Error && error.message.startsWith('Saved itineraries request failed')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new Error('Saved itineraries database did not respond.');
}

const summaryColumns = 'id,client_name,arrival,departure,days,nights,package_total,created_at,updated_at,last_downloaded_at,download_count';
export async function listSavedItineraries(): Promise<SavedItinerarySummary[]> {
  const pageSize = 500;
  const items: SavedItinerarySummary[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await call(`?select=${summaryColumns}&order=created_at.desc,id.desc&limit=${pageSize}&offset=${offset}`) as SavedItinerarySummary[];
    if (!Array.isArray(page)) throw new Error('The saved itinerary database returned an invalid list.');
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}
export async function getSavedItinerary(id: string): Promise<SavedItinerary | null> {
  const rows = await call(`?select=*&id=eq.${encodeURIComponent(id)}&limit=1`) as SavedItinerary[];
  return rows[0] || null;
}
export async function saveItinerary(snapshot: ItinerarySnapshot, total: number, id?: string, downloaded = false): Promise<SavedItinerary> {
  const now = new Date().toISOString();
  const existing = id ? await getSavedItinerary(id) : null;
  if (id && !existing) throw new Error('This saved itinerary no longer exists. Open Saved Itineraries and try again.');
  const row = {
    client_name: snapshot.input.name.trim() || 'Traveller',
    arrival: /^\d{4}-\d{2}-\d{2}$/.test(snapshot.input.arrival) ? snapshot.input.arrival : null,
    departure: /^\d{4}-\d{2}-\d{2}$/.test(snapshot.input.departure) ? snapshot.input.departure : null,
    days: snapshot.plan?.days || 0,
    nights: snapshot.plan?.nights || 0,
    package_total: Math.round(total),
    snapshot,
    updated_at: now,
    last_downloaded_at: downloaded ? now : existing?.last_downloaded_at || null,
    download_count: (existing?.download_count || 0) + (downloaded ? 1 : 0),
  };
  const rows = existing
    ? await call(`?id=eq.${encodeURIComponent(existing.id)}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }) as SavedItinerary[]
    : await call('?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }) as SavedItinerary[];
  if (!rows[0]) throw new Error('The itinerary database did not confirm the save.');
  return rows[0];
}
