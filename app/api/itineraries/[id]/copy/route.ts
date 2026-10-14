import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { copySavedItinerary } from '@/lib/itinerary-store';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid itinerary id.' }, { status: 400 });
  try {
    const copy = await copySavedItinerary(id);
    if (!copy) return NextResponse.json({ error: 'Itinerary not found.' }, { status: 404 });
    const { snapshot: _snapshot, ...itinerary } = copy;
    return NextResponse.json({ itinerary }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create a copy.' }, { status: 503 });
  }
}
