import { validatePdfDesign, type PdfDesignSettings, type PdfImageSlot } from '@/lib/pdf-designs';
import type { PdfMasterManifest } from '@/lib/pdf-composition';
import type { PdfFonts } from '@/lib/pdf-types';

async function asset(path: string): Promise<Response> {
  const response = await fetch(path, { cache: path.startsWith('/api/') ? 'no-store' : 'force-cache', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load your PDF images.' : 'Could not load a PDF design image or font. Please retry.');
  return response;
}
async function dataUrl(path: string) {
  const blob = await (await asset(path)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read a PDF asset.'));
    reader.onerror = () => reject(new Error('Could not read a PDF asset.'));
    reader.readAsDataURL(blob);
  });
}
let base: Promise<{ masterBytes: ArrayBuffer; manifest: PdfMasterManifest; fonts: PdfFonts; brand: { brandWhite: string; brandInk: string } }> | undefined;
function baseAssets() {
  if (!base) base = (async () => {
    const [master, manifest, regular, bold, cover, brandWhite, brandInk] = await Promise.all([
      asset('/pdf-assets/client-master.pdf').then(r => r.arrayBuffer()),
      asset('/pdf-assets/client-master.json').then(r => r.json() as Promise<PdfMasterManifest>),
      dataUrl('/fonts/Evolventa-Regular.ttf'), dataUrl('/fonts/Evolventa-Bold.ttf'), dataUrl('/fonts/RedHatDisplay-400.ttf'),
      dataUrl('/chakar-logo-original-white.png'), dataUrl('/chakar-logo-original-ink.png'),
    ]);
    return { masterBytes: master, manifest, fonts: { regular: regular.split(',')[1], bold: bold.split(',')[1], cover: cover.split(',')[1] }, brand: { brandWhite, brandInk } };
  })().catch(error => { base = undefined; throw error; });
  return base;
}
export async function loadPdfDesignAssets(settings: PdfDesignSettings) {
  const design = validatePdfDesign(settings);
  const imageRequests = new Map<string, Promise<string>>();
  const resolvedImages: Partial<Record<PdfImageSlot, string>> = {};
  const [shared] = await Promise.all([baseAssets(), Promise.all(Object.entries(design.images).map(async ([slot, path]) => {
    if (!imageRequests.has(path)) imageRequests.set(path, dataUrl(path));
    resolvedImages[slot as PdfImageSlot] = await imageRequests.get(path)!;
  }))]);
  return { ...shared, resolvedImages };
}
