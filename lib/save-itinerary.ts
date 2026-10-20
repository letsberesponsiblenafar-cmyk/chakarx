import { itinerarySnapshot, type PlannerState } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';
import type { PackageDefaults } from '@/lib/package-defaults';

export async function savePlannerItinerary(state: PlannerState & { packageDefaults?: PackageDefaults }, downloaded: boolean): Promise<string> {
  if (!state.plan) throw new Error('Generate an itinerary before saving it.');
  const total = calculateCosts(state.plan, state.hotelSelections, state.costModel).sellingTotal;
  const response = await fetch('/api/itineraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ id: state.savedItineraryId || undefined, snapshot: itinerarySnapshot(state, state.packageDefaults), total, downloaded }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.itinerary?.id) throw new Error(payload.error || 'Could not save this itinerary.');
  return payload.itinerary.id as string;
}
