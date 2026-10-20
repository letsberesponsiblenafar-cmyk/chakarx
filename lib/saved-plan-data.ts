import type { Hotel } from '@/lib/data';
import type { Plan } from '@/lib/itinerary';
import type { HotelSelection, PlannerState } from '@/components/PlannerProvider';
import { snapshotPlanDestinations } from '@/lib/plan-destinations';
import { initialPackageDefaults, type PackageDefaults } from '@/lib/package-defaults';

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Reference records are scoped to this trip, never the whole private master. */
export function savedHotelMaster(plan: Plan, current: Hotel[]): Hotel[] {
  if (plan.referenceMode !== 'saved') return current;
  const records = new Map(current.map((hotel) => [hotel.id, hotel]));
  for (const hotel of plan.hotelSnapshot || []) records.set(hotel.id, hotel);
  return [...records.values()];
}

function historicalHotel(selection: Pick<HotelSelection, 'hotelId' | 'hotelName' | 'category' | 'nightlyRate' | 'extraBedRate' | 'cnbRate' | 'source' | 'status'> & Partial<Pick<HotelSelection, 'starRating' | 'address' | 'roomType' | 'website'>>, location: string): Hotel {
  return { id: selection.hotelId, name: selection.hotelName, destination: location,
    normalizedCategory: selection.category, sourceCategory: selection.category, starRating: selection.starRating ?? null,
    mapB2B: selection.nightlyRate, extraBedB2B: selection.extraBedRate, cnbB2B: selection.cnbRate,
    address: selection.address || '', roomType: selection.roomType || '', website: selection.website || '', sourceType: selection.source,
    rateValidity: '', availabilityStatus: selection.status, lastUpdated: '', sourceFiles: [], notes: '' };
}

/** Capture once; reopening never substitutes today's libraries or supplier data. */
export function freezePlannerState(state: PlannerState, defaults: PackageDefaults = initialPackageDefaults(), restoring = false): PlannerState {
  if (!state.plan) return state;
  const plan = state.plan;
  const selections = [...state.hotelSelections, ...Object.values(state.packageQuotes || {}).flatMap((quote) => quote.hotelSelections)];
  const previous = new Map((plan.hotelSnapshot || []).map((hotel) => [hotel.id, hotel]));
  const current = new Map(state.hotelDatabase.map((hotel) => [hotel.id, hotel]));
  const records = new Map<string, Hotel>();
  for (const selection of selections) for (const hotel of [selection, ...(selection.alternatives || [])]) {
    if (!hotel.hotelId || records.has(hotel.hotelId)) continue;
    records.set(hotel.hotelId, previous.get(hotel.hotelId) || (!restoring ? current.get(hotel.hotelId) : undefined) || historicalHotel(hotel, selection.location));
  }
  const destinationSnapshot = plan.referenceMode === 'saved' || restoring
    ? plan.destinationSnapshot ?? (plan.stays || []).map((stay) => stay.destination).filter(Boolean)
    : snapshotPlanDestinations(plan);
  return { ...state, plan: copy({ ...plan, referenceMode: 'saved', destinationSnapshot,
    hotelSnapshot: [...records.values()], packageDefaultsSnapshot: plan.packageDefaultsSnapshot || defaults }) };
}
