import { itinerarySnapshot, type PlannerState } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';

export async function savePlannerItinerary(state: PlannerState, downloaded: boolean): Promise<string> {
  if (!state.plan) throw new Error('Generate an itinerary before saving it.');
  const total = calculateCosts(state.plan, state.hotelSelections, state.costModel).sellingTotal;
  const response = await fetch('/api/itineraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: state.savedItineraryId || undefined, snapshot: itinerarySnapshot(state), total, downloaded }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.itinerary?.id) throw new Error(payload.error || 'Could not save this itinerary.');
  return payload.itinerary.id as string;
}
