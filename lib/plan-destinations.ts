import { archivedDestinationCatalog, destinations, withDestinationCatalog, type Destination } from '@/lib/data';
import type { Plan } from '@/lib/itinerary';

function referencedNames(plan: Pick<Plan, 'dayPlans'>) {
  return new Set((plan.dayPlans || []).flatMap((day) => [day.from, day.to, day.stay, day.dayTripDestination,
    ...(day.additionalVisitDestinations || []),
    ...(day.blocks || []).flatMap((block) => [block.destination, ...(block.librarySights || []).map((sight) => sight.destination)]),
    ...(day.scheduledActivities || []).map((activity) => activity.destination),
  ].filter((name): name is string => Boolean(name))));
}

/** Drafts follow the library; saved trips retain the reference data they saved. */
export function planDestinations(plan: Plan, catalog: Destination[] = destinations): Destination[] {
  const byName = new Map(catalog.map((destination) => [destination.name, destination]));
  const referenced = referencedNames(plan);
  // Legacy quotes captured overnight guides in stays, but not day-trip guides.
  const fallback = plan.destinationSnapshot === undefined
    ? [...(plan.stays || []).flatMap((stay) => stay.destination ? [stay.destination] : []), ...archivedDestinationCatalog()]
    : plan.destinationSnapshot;
  if (plan.referenceMode === 'saved') {
    // Do not substitute today's guide for missing historical information.
    for (const name of referenced) byName.delete(name);
    for (const destination of fallback) if (referenced.has(destination.name)) byName.set(destination.name, destination);
    return [...byName.values()];
  }
  for (const destination of fallback) if (referenced.has(destination.name) && !byName.has(destination.name)) {
    byName.set(destination.name, { ...destination, library_archived: true });
  }
  return [...byName.values()];
}

export function snapshotPlanDestinations(plan: Plan, includeNewChoices = false) {
  const referenced = referencedNames(plan);
  const catalog = planDestinations(plan);
  // Choosing a new place is a deliberate edit, not a refresh of existing guides.
  if (includeNewChoices && plan.referenceMode === 'saved') {
    const captured = new Set(catalog.map((destination) => destination.name));
    for (const destination of destinations) if (referenced.has(destination.name) && !captured.has(destination.name)) catalog.push(destination);
  }
  return catalog.filter((destination) => referenced.has(destination.name)).map((destination) =>
    JSON.parse(JSON.stringify(destination)) as Destination);
}

export function withPlanDestinations<T>(plan: Plan, work: () => T): T {
  return withDestinationCatalog(planDestinations(plan), work);
}

/** Srinagar remains the airport/hotel hub when its library guide is removed. */
export function srinagarLogisticsGuide(): Destination {
  return { id: '__srinagar_logistics__', name: 'Srinagar', tier: 'Hub', district: 'Srinagar', tags: [],
    min_days: 0, ideal_days: 0, max_days: 30, min_nights: 0, ideal_nights: 0, max_nights: 30,
    overnight_allowed: true, season: 'all', access: '', source: 'Journey logistics', description: '',
    highlights: [], local_sightseeing: [], things_to_do: [], activities: [], enabled_sightseeing: [],
    enabled_activities: [], photoQuery: '', sites: [], base: true, cluster: 'central', srinagar_hours: 0,
    srinagar_km: 0, day_note: '', activity_copy: {}, activity_timing: {} };
}
