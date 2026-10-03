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
      available: destination.enabled_activities === undefined || destination.enabled_activities.includes(name),
    })),
  );
}

export function quotedActivityCost(costs: Record<string, number>, activity: TripActivity): number | null {
  const value = costs?.[activity.key];
  // A price is an explicit operator choice for this client. Library switches
  // govern automatic day descriptions, not a manually quoted package item.
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
