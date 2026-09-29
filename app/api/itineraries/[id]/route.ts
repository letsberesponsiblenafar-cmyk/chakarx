import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-auth';
import { getSavedItinerary } from '@/lib/itinerary-store';
export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid itinerary id.' }, { status: 400 });
  try {
    const itinerary = await getSavedItinerary(id);
    return itinerary ? NextResponse.json({ itinerary }, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Itinerary not found.' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load itinerary.' }, { status: 503 });
  }
}
