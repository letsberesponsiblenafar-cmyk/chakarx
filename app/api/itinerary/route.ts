import { NextResponse } from 'next/server';
import { createPlan } from '@/lib/itinerary';
import { destinationStoreConfigured, listDestinations } from '@/lib/destination-store';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  let input;
  try {
    input = (await request.json())?.input;
    if (!input) throw new Error('Trip input is required.');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid trip input.' }, { status: 400 });
  }
  let catalog;
  try {
    catalog = destinationStoreConfigured() ? await listDestinations() : undefined;
  } catch {
    return NextResponse.json({ error: 'Could not load the destination library. Please retry before creating the itinerary.' }, { status: 503 });
  }
  try {
    return NextResponse.json({ plan: createPlan(input, catalog) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create itinerary.' }, { status: 400 });
  }
}
