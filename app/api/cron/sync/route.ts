import { NextResponse } from 'next/server';
import { sources } from '@/lib/data';
import { checkAndRecordSource } from '@/lib/source-observations';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 });
  }
  const results = await Promise.allSettled(sources.map((_, index) => checkAndRecordSource(index)));
  const failures = results.map((result, index) => result.status === 'rejected' ? { source: sources[index].name, error: result.reason instanceof Error ? result.reason.message : 'Check failed' } : null).filter(Boolean);
  return NextResponse.json({ ok: failures.length === 0, checked: results.length - failures.length, failed: failures }, { status: failures.length ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
