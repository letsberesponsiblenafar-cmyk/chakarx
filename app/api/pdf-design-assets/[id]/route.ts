import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-auth';
import { loadPdfDesignAsset } from '@/lib/pdf-design-store';

export const runtime = 'nodejs';
const errorHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401, headers: errorHeaders });
  try {
    const { id } = await context.params;
    const image = await loadPdfDesignAsset(id);
    if (!image) return NextResponse.json({ error: 'Image not found.' }, { status: 404, headers: errorHeaders });
    return new NextResponse(new Uint8Array(image.bytes), { headers: {
      'Content-Type': image.mime, 'Content-Length': String(image.bytes.length),
      'Content-Disposition': `inline; filename="${id}.${image.mime === 'image/png' ? 'png' : 'jpg'}"`,
      'Cache-Control': 'private, max-age=31536000, immutable', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch { return NextResponse.json({ error: 'Could not load this image. Please retry.' }, { status: 503, headers: errorHeaders }); }
}
