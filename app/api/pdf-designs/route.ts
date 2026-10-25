import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { loadPdfDesignLibrary, savePdfDesign, readPdfDesignBody, PdfDesignInputError, PdfDesignConflictError } from '@/lib/pdf-design-store';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401, headers });
  try { return NextResponse.json({ designs: await loadPdfDesignLibrary() }, { headers }); }
  catch { return NextResponse.json({ error: 'Could not load PDF designs. Please retry.' }, { status: 503, headers }); }
}
export async function PUT(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  try {
    const body = await readPdfDesignBody(request, 32000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PdfDesignInputError('Invalid PDF design.');
    const { theme, settings, revision } = body as Record<string, unknown>;
    return NextResponse.json({ design: await savePdfDesign(theme, settings, revision) }, { headers });
  } catch (error) {
    const status = error instanceof PdfDesignInputError ? error.status : error instanceof PdfDesignConflictError ? 409 : 503;
    return NextResponse.json({ error: status === 503 ? 'Could not save this PDF design. Please retry.' : (error as Error).message }, { status, headers });
  }
}
