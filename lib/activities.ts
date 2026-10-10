import { destinations, type Destination } from '@/lib/data';
import type { Plan } from '@/lib/itinerary';

export type TripActivity = { key: string; destination: string; name: string; available: boolean };

export function tripActivities(plan: Plan, catalog: Destination[] = destinations, _selections: Record<string, boolean> = {}): TripActivity[] {
  const visited = new Set(plan.dayPlans.flatMap((day) => [day.from, day.to, day.stay, day.dayTripDestination].filter((name): name is string => Boolean(name))));
  return catalog.filter((destination) => visited.has(destination.name)).flatMap((destination) =>
    destination.activities.map((name) => ({
      key: `${destination.name}\u001f${name}`,
      destination: destination.name,
      name,
      available: (destination.enabled_activities || []).includes(name),
    })),
  );
}

export function activitySelected(activity: TripActivity, selections: Record<string, boolean> = {}, costs: Record<string, number> = {}) {
  if (typeof selections[activity.key] === 'boolean') return selections[activity.key];
  // Older saved itineraries had prices but no per-trip checkboxes. Preserve
  // those explicit quotes until the operator changes their selection.
  const legacyCost = costs[activity.key];
  return activity.available && typeof legacyCost === 'number' && Number.isFinite(legacyCost) && legacyCost >= 0;
}

export function quotedActivityCost(costs: Record<string, number>, activity: TripActivity, selections: Record<string, boolean> = {}): number | null {
  if (!activitySelected(activity, selections, costs)) return null;
  const value = costs?.[activity.key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function clientActivityLists(plan: Plan, costs: Record<string, number>, selections: Record<string, boolean> = {}, manualInclusions: string[] = [], manualExclusions: string[] = [], catalog: Destination[] = destinations) {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const activity of tripActivities(plan, catalog, selections)) {
    const label = `${activity.destination}: ${activity.name}`;
    if (quotedActivityCost(costs, activity, selections) !== null) included.push(label);
    else if (selections[activity.key] === false) excluded.push(label);
  }
  const seen = new Set([...included, ...excluded].map((item) => item.toLowerCase()));
  for (const raw of manualInclusions) {
    const item = String(raw).trim();
    if (item && !seen.has(item.toLowerCase())) { included.push(item); seen.add(item.toLowerCase()); }
  }
  for (const raw of manualExclusions) {
    const item = String(raw).trim();
    if (item && !seen.has(item.toLowerCase())) { excluded.push(item); seen.add(item.toLowerCase()); }
  }
  return { included, excluded };
}
