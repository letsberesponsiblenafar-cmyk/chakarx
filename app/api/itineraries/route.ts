import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { getSavedItinerary, itineraryStoreConfigured, listSavedItineraries, saveItinerary } from '@/lib/itinerary-store';
import type { ItinerarySnapshot } from '@/components/PlannerProvider';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validSnapshot(value: unknown): value is ItinerarySnapshot {
  if (!value || typeof value !== 'object') return false;
  const x = value as Partial<ItinerarySnapshot>;
  return Boolean(x.input && typeof x.input.name === 'string' && x.input.name.length <= 200 && x.plan &&
    Array.isArray(x.plan.dayPlans) && x.plan.dayPlans.length > 0 && x.plan.dayPlans.length <= 31 &&
    Array.isArray(x.hotelSelections) && x.hotelSelections.length <= 31 && x.costModel && x.hotelDefaults);
}
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  try {
    return NextResponse.json({ itineraries: await listSavedItineraries(), configured: itineraryStoreConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load saved itineraries.' }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return NextResponse.json({ error: 'Itinerary is too large to save.' }, { status: 413 });
    const payload = JSON.parse(raw) as { id?: unknown; snapshot?: unknown; total?: unknown; downloaded?: unknown };
    if (!validSnapshot(payload.snapshot) || typeof payload.total !== 'number' || !Number.isFinite(payload.total) || payload.total < 0 || payload.total > 1e10 ||
      (payload.id !== undefined && (typeof payload.id !== 'string' || !uuid.test(payload.id))) || typeof payload.downloaded !== 'boolean') {
      return NextResponse.json({ error: 'Invalid itinerary data.' }, { status: 400 });
    }
    if (payload.id && !await getSavedItinerary(payload.id)) return NextResponse.json({ error: 'Saved itinerary was not found.' }, { status: 404 });
    const itinerary = await saveItinerary(payload.snapshot, payload.total, payload.id as string | undefined, payload.downloaded);
    return NextResponse.json({ itinerary: { id: itinerary.id, updated_at: itinerary.updated_at } }, { status: payload.id ? 200 : 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save itinerary.' }, { status: 503 });
  }
}
