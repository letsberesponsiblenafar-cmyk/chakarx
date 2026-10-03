import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { destinationStoreConfigured, listDestinations, saveDestination } from '@/lib/destination-store';
import { validateDestination } from '@/lib/destination-validation';

export const runtime = 'nodejs';
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  try {
    if (!destinationStoreConfigured()) throw new Error('Destination database is not configured.');
    const destinations = await listDestinations();
    return NextResponse.json({ destinations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load destinations.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const destination = validateDestination(await request.json());
    const existing = await listDestinations();
    if (existing.some((item) => item.name.toLowerCase() === destination.name.toLowerCase() && item.id !== destination.id)) throw new Error('Another destination already uses this name.');
    await saveDestination(destination);
    return NextResponse.json({ destination }, { status: 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save destination.' }, { status: 400 }); }
}
