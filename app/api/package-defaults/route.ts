import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { loadPackageDefaults, savePackageDefaults } from '@/lib/destination-store';
import { validatePackageDefaults } from '@/lib/package-defaults';

export const runtime = 'nodejs';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  try {
    return NextResponse.json({ packageDefaults: await loadPackageDefaults() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load package defaults.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let defaults;
  try {
    const body = await request.text();
    if (body.length > 60000) throw new Error('Package defaults are too large. Use up to 80 short lines in each list.');
    defaults = validatePackageDefaults(JSON.parse(body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid package defaults.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ packageDefaults: await savePackageDefaults(defaults) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save package defaults.' }, { status: 503 });
  }
}
