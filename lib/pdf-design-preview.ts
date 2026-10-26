import { PDFDocument } from 'pdf-lib';
import { buildThemedClientPdf } from '@/components/ClientPdf';
import type { HotelSelection, CostModel } from '@/components/PlannerProvider';
import { createPlan, type TripInput } from '@/lib/itinerary';
import { calculateCosts } from '@/lib/costing';
import { validatePdfDesign, type PdfDesignSettings } from '@/lib/pdf-designs';
import { loadPdfDesignAssets } from '@/lib/pdf-render-assets';
import { pdfPageId, pdfPageDefinition, type PdfPageId } from '@/lib/pdf-design-pages';
export type PdfPreviewPage = { key: PdfPageId; title: string };

/** The editor uses the actual export path, with an isolated sample, never a saved client trip. */
export async function renderPdfDesignPreview(settings: PdfDesignSettings): Promise<{ url: string; pageCount: number; pages: PdfPreviewPage[] }> {
  const design = validatePdfDesign(settings);
  const assets = await loadPdfDesignAssets(design);
  const input: TripInput = { name: 'Your Guest', arrival: '2026-12-03', departure: '2026-12-10', pickup: 'Srinagar', adults: 2,
    youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Ertiga', mealPlan: 'Breakfast & Dinner', style: 'Balanced',
    interests: ['Nature', 'Photography'], hotelOptionMode: 'single', pdfTheme: design.theme, pdfDesign: design };
  const plan = createPlan(input);
  const selections: HotelSelection[] = plan.hotelPlans.map(stay => ({ location: stay.location, hotelId: '', hotelName: `${stay.location} Heritage Retreat`,
    category: 'Signature', starRating: 4, address: '', roomType: '', website: '', nights: stay.nights, rooms: 1, extraBeds: 0, cnb: 0,
    nightlyRate: 4800, extraBedRate: 0, cnbRate: 0, source: 'Design preview only', status: 'sample' }));
  const quote: CostModel = { transportDaily: 4200, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {},
    activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
  const data = { cover: '', letter: '', summary: '', daywise: '', package: '', hotels: '', inclusions: '', exclusions: '', policies: '', testimonials: '', thanks: '',
    vectorBackgrounds: true, ...assets.brand };
  let pages: PdfPreviewPage[] = [];
  const bytes = await buildThemedClientPdf({ ...assets, data, design, input, plan, selections, costs: calculateCosts(plan, selections, quote),
    onPages: artwork => { pages = artwork.map(page => ({ key: pdfPageId(page.key), title: pdfPageDefinition(page.key).title })); },
    customerName: input.name, quote, activityLists: { included: ['One-hour Shikara ride on Dal Lake.'], excluded: ['Airfare and personal expenses.'] } });
  const pdf = await PDFDocument.load(bytes);
  return { url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), pageCount: pdf.getPageCount(), pages };
}
