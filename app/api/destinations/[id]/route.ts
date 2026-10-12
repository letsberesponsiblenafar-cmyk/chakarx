import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { deleteDestination, listDestinations } from '@/lib/destination-store';
import { PACKAGE_DEFAULTS_RECORD_ID } from '@/lib/package-defaults';

export const runtime = 'nodejs';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const { id } = await params;
  if (!id || id.length > 100 || id.trim() !== id || id === PACKAGE_DEFAULTS_RECORD_ID) {
    return NextResponse.json({ error: 'Choose a valid destination to delete.' }, { status: 400 });
  }
  let confirmationName: string;
  try {
    const payload = await request.json();
    if (typeof payload?.confirmationName !== 'string' || !payload.confirmationName.trim() || payload.confirmationName.length > 100) throw new Error();
    confirmationName = payload.confirmationName.trim();
  } catch {
    return NextResponse.json({ error: 'Type the destination name to confirm deletion.' }, { status: 400 });
  }
  try {
    const destination = (await listDestinations()).find((item) => (item.id || item.name) === id);
    if (!destination) return NextResponse.json({ error: 'Destination not found. It may already have been deleted.' }, { status: 404 });
    if (confirmationName !== destination.name) return NextResponse.json({ error: 'The destination name does not match. Check its current name before deleting.' }, { status: 409 });
    await deleteDestination(destination);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not delete destination.' }, { status: 503 });
  }
}
