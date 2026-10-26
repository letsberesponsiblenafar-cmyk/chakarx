import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import type { calculateCosts } from '@/lib/costing';
import type { Plan, TripInput } from '@/lib/itinerary';

export type Costs = ReturnType<typeof calculateCosts>;
export type PdfFonts = { regular: string; bold: string; cover: string; redhatBold?: string };
export type ActivityLists = { included: string[]; excluded: string[] };
export type ClientPdfPackageQuote = {
  category: string; plan: Plan; input: TripInput; selections: HotelSelection[];
  costs: Costs; quote?: CostModel;
};
