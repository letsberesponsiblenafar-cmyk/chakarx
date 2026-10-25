import { NextResponse } from 'next/server';
import { isAdmin, sameOrigin } from '@/lib/admin-auth';
import { savePdfDesignAsset, readPdfDesignBody, PdfDesignInputError } from '@/lib/pdf-design-store';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  try {
    const body = await readPdfDesignBody(request, 3 * 1024 * 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PdfDesignInputError('Choose an image to upload.');
    const { dataUrl, name } = body as Record<string, unknown>;
    return NextResponse.json(await savePdfDesignAsset(dataUrl, name), { status: 201, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PdfDesignInputError ? error.message : 'Could not upload the image. Please retry.' },
      { status: error instanceof PdfDesignInputError ? error.status : 503, headers });
  }
}
