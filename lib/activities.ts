import { destinations, type Destination } from '@/lib/data';
import type { Plan } from '@/lib/itinerary';

export type TripActivity = { key: string; destination: string; name: string; available: boolean };

export function tripActivities(plan: Plan, catalog: Destination[] = destinations): TripActivity[] {
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

export function quotedActivityCost(costs: Record<string, number>, activity: TripActivity): number | null {
  if (!activity.available) return null;
  const value = costs?.[activity.key];
  // A library switch controls whether this activity can be quoted for a trip.
  // Unticked activities remain visible only in the client exclusions.
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function clientActivityLists(plan: Plan, costs: Record<string, number>, catalog: Destination[] = destinations) {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const activity of tripActivities(plan, catalog)) {
    const label = `${activity.destination}: ${activity.name}`;
    if (quotedActivityCost(costs, activity) !== null) included.push(label);
    else excluded.push(label);
  }
  return { included, excluded };
}
