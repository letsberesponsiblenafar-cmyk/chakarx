import { hotelCategories } from '@/lib/data';
import type { TripInput } from '@/lib/itinerary';
import type { CostModel, HotelSelection, PlannerState } from '@/components/PlannerProvider';

export type PackageQuote = {
  hotelSelections: HotelSelection[];
  costOverrides?: Partial<CostModel>;
  /** Missing means use the trip's default vehicle and daily rate. */
  transport?: string;
};

/** Older saved itineraries contain only hotelCategory. */
export function packageCategories(input: Pick<TripInput, 'hotelCategory' | 'packagePreferences'>): string[] {
  const requested = Array.isArray(input.packagePreferences) ? input.packagePreferences : [];
  const selected = [...new Set(requested.filter((category) => hotelCategories.includes(category)))];
  return selected.length ? selected : [hotelCategories.includes(input.hotelCategory) ? input.hotelCategory : hotelCategories[0]];
}

/** Shared journey, with an independent accommodation quote for each category. */
export function packageView<T extends PlannerState>(state: T, category: string): T {
  const primary = state.plan?.input.hotelCategory || state.input.hotelCategory;
  const quote = category === primary ? undefined : state.packageQuotes?.[category];
  const transport = quote?.transport ?? state.input.transport;
  const input = { ...state.input, hotelCategory: category, packagePreferences: [category], transport };
  const costModel = { ...state.costModel, ...quote?.costOverrides };
  if (quote && quote.transport === undefined) {
    costModel.transportDaily = state.costModel.transportDaily;
    costModel.transportIsCustom = state.costModel.transportIsCustom;
  }
  return { ...state, input,
    plan: state.plan ? { ...state.plan, input: { ...state.plan.input, hotelCategory: category, packagePreferences: [category], transport } } : null,
    hotelSelections: category === primary ? state.hotelSelections : quote?.hotelSelections || [],
    costModel,
  };
}

function validHotelQuote(value: unknown, stay: boolean): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!['hotelId', 'hotelName', 'category', 'source', 'status'].every((key) => typeof item[key] === 'string' && (item[key] as string).length <= 5000)) return false;
  const amounts = ['nightlyRate', 'extraBedRate', 'cnbRate', ...(stay ? ['nights', 'rooms', 'extraBeds', 'cnb'] : [])];
  if (!amounts.every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]) && (item[key] as number) >= 0 && (item[key] as number) <= 1e10)) return false;
  if (!stay) return true;
  return typeof item.location === 'string' && item.location.length <= 200 &&
    Number.isInteger(item.nights) && (item.nights as number) <= 30 &&
    ['rooms', 'extraBeds', 'cnb'].every((key) => Number.isInteger(item[key])) &&
    (item.accommodationType === undefined || ['hotel', 'houseboat'].includes(item.accommodationType as string)) &&
    (item.nightNumbers === undefined || Array.isArray(item.nightNumbers) && item.nightNumbers.length <= 30 && new Set(item.nightNumbers).size === item.nightNumbers.length && item.nightNumbers.every((night) => Number.isInteger(night) && night >= 1 && night <= 30)) &&
    (item.alternatives === undefined || Array.isArray(item.alternatives) && item.alternatives.length <= 2 && item.alternatives.every((option) => validHotelQuote(option, false))) &&
    (item.sharedCustomRates === undefined || item.sharedCustomRates !== null && typeof item.sharedCustomRates === 'object' && ['nightlyRate', 'extraBedRate', 'cnbRate'].every((key) => {
      const amount = (item.sharedCustomRates as Record<string, unknown>)[key]; return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= 1e10;
    }));
}

export function validPackageQuotes(value: unknown): value is Record<string, PackageQuote> {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= hotelCategories.length && entries.every(([category, quote]) =>
    hotelCategories.includes(category) && quote && typeof quote === 'object' &&
    Array.isArray(quote.hotelSelections) && quote.hotelSelections.length <= 62 && quote.hotelSelections.every((hotel: unknown) => validHotelQuote(hotel, true)) &&
    (quote.transport === undefined || typeof quote.transport === 'string' && quote.transport.length <= 80) &&
    (quote.costOverrides === undefined || quote.costOverrides && typeof quote.costOverrides === 'object' && !Array.isArray(quote.costOverrides) &&
      Object.entries(quote.costOverrides).every(([key, amount]) =>
        key === 'transportIsCustom' ? typeof amount === 'boolean' :
        ['transportDaily', 'profitPct', 'otherAmount'].includes(key) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= (key === 'profitPct' ? 100 : 1e10))));
}
