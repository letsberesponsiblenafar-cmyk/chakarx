import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-auth';
import { sources } from '@/lib/data';
import { checkAndRecordSource, latestSourceObservations } from '@/lib/source-observations';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  const raw = new URL(request.url).searchParams.get('source');
  try {
    if (raw === null) return NextResponse.json({ observations: await latestSourceObservations() }, { headers: { 'Cache-Control': 'no-store' } });
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || !sources[index]) return NextResponse.json({ error: 'Unknown source.' }, { status: 400 });
    const observation = await checkAndRecordSource(index);
    return NextResponse.json(observation, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source check failed.' }, { status: 503 });
  }
}
