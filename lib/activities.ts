import { destinations, packageTermKey, type Destination } from '@/lib/data';
import type { Plan } from '@/lib/itinerary';
import { initialPackageDefaults, type PackageDefaults } from '@/lib/package-defaults';
import { planDestinations } from '@/lib/plan-destinations';

export type TripActivity = { key: string; destination: string; name: string; available: boolean };

export function tripActivityDestinations(plan: Plan): Set<string> {
  return new Set(plan.dayPlans.flatMap((day) => [day.from, day.to, day.stay, day.dayTripDestination].filter((name): name is string => Boolean(name))));
}

export function tripActivities(plan: Plan, catalog: Destination[] = destinations, _selections: Record<string, boolean> = {}): TripActivity[] {
  const visited = tripActivityDestinations(plan);
  return planDestinations(plan, catalog).filter((destination) => visited.has(destination.name)).flatMap((destination) =>
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
  if (!activity.available) return null;
  if (!activitySelected(activity, selections, costs)) return null;
  const value = costs?.[activity.key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function programmeDestinations(plan: Plan): Set<string> {
  // A hotel base or a road connection alone is not a sightseeing visit. Use the
  // programme itself so a destination removed from the journey adds no terms.
  return new Set(plan.dayPlans.flatMap((day) => [
    // Keep the selected visit even if its library currently has no checked
    // places. The final airport transfer alone is not a Srinagar visit.
    day.dayTripDestination || (day.label === 'Departure day' ? undefined
      : day.transfer && day.stay === 'Srinagar' && day.from !== day.stay ? day.from : day.stay),
    ...(day.additionalVisitDestinations || []),
    ...day.blocks.filter((block) => block.kind === 'sightseeing' || block.kind === 'custom').map((block) => block.destination),
    ...(day.scheduledActivities || []).map((activity) => activity.destination),
  ].filter((name): name is string => Boolean(name))));
}

function clauseIdentities(value: string, catalog: Destination[], destination?: string): string[] {
  let label = value.trim();
  const separator = label.indexOf(':');
  const prefixed = separator >= 0 ? catalog.find((item) => item.name.toLowerCase() === label.slice(0, separator).trim().toLowerCase()) : undefined;
  if (prefixed) label = label.slice(separator + 1);
  const normalize = (text: string) => packageTermKey(text.replace(/\s*[—–-]\s*activity charges[.!?]?\s*$/i, ''));
  const normalized = normalize(label);
  if (normalized === 'airfare' || normalized === 'train tickets') return [normalized];
  const matches = (name: string) => {
    const activity = normalize(name);
    const labels = activity === 'gondola ride' ? [activity, 'gondola', 'gulmarg gondola']
      : ['shikara ride', 'sunrise or sunset shikara ride'].includes(activity) ? [activity, 'shikara ride', 'shikara'] : [activity];
    return labels.some((label) => normalized === label || ['tickets', 'ticket', 'charges', 'activity charges', 'tickets not included', 'charges not included'].some((suffix) => normalized === `${label} ${suffix}`));
  };
  const matching = catalog.flatMap((item) => item.activities.filter(matches).map((name) => ({ destination: item.name, name })));
  const scopedActivity = matching.find((item) => item.destination === (prefixed?.name || destination)) || (matching.length === 1 ? matching[0] : undefined);
  const activityKey = (activity: { destination: string; name: string }) => `${activity.destination.toLowerCase()}\u001f${normalize(activity.name)}`;
  if (scopedActivity) return [activityKey(scopedActivity)];
  // A common line such as "Horse riding charges" covers the known activity in
  // multiple valleys. Keep the real quote entries separate, but do not print
  // a broad default that contradicts any of their explicit decisions.
  if (matching.length) return [...new Set(matching.map(activityKey))];
  return normalized ? [prefixed ? `${prefixed.name.toLowerCase()}\u001f${normalized}` : normalized] : [];
}

export function clientActivityLists(plan: Plan, costs: Record<string, number>, selections: Record<string, boolean> = {}, manualInclusions: string[] = [], manualExclusions: string[] = [], catalog: Destination[] = destinations, packageDefaults: PackageDefaults = initialPackageDefaults()) {
  if (plan.referenceMode === 'saved' && plan.packageDefaultsSnapshot) packageDefaults = plan.packageDefaultsSnapshot;
  catalog = planDestinations(plan, catalog);
  const included: string[] = [];
  const excluded: string[] = [];
  const activities = tripActivities(plan, catalog, selections);
  const visited = programmeDestinations(plan);
  const clauseCatalog = catalog.filter((destination) => visited.has(destination.name) || activities.some((activity) => activity.destination === destination.name));
  const seen = new Set<string>();
  const unquotedActivities = new Set<string>();
  const append = (target: string[], raw: string, destination?: string) => {
    const item = String(raw).trim();
    const identities = clauseIdentities(item, clauseCatalog, destination);
    if (identities.length && !identities.some((identity) => seen.has(identity))) { target.push(item); identities.forEach((identity) => seen.add(identity)); }
  };
  for (const activity of activities) {
    const label = `${activity.destination}: ${activity.name}`;
    if (quotedActivityCost(costs, activity, selections) !== null) append(included, label);
    else {
      clauseIdentities(label, clauseCatalog).forEach((identity) => unquotedActivities.add(identity));
      if (selections[activity.key] !== false) continue;
      // A selected visit can stay in the travel programme while its ticket or
      // arranged experience is paid separately. Do not label the visit itself
      // as absent when the operator explicitly kept it in Things to Do.
      const destination = catalog.find((item) => item.name === activity.destination);
      const linked = destination?.local_sightseeing.filter((sight) => sight.requires_activity === activity.name ||
        destination.activity_timing?.[activity.name]?.sight_names?.includes(sight.name)).map((sight) => sight.name) || [];
      const described = plan.dayPlans.some((day) => day.blocks.some((block) => block.destination === activity.destination &&
        (block.sights || [block.name]).some((name) => linked.includes(name))));
      append(excluded, described ? `${label} — activity charges` : label);
    }
  }
  for (const raw of manualInclusions) append(included, raw);
  for (const raw of manualExclusions) append(excluded, raw);
  // One itinerary-wide list, independent of the destination catalogue. The
  // explicit quote/manual choices above always take priority over defaults.
  for (const raw of packageDefaults.excluded) append(excluded, raw);
  for (const raw of packageDefaults.included) {
    if (!clauseIdentities(raw, clauseCatalog).some((identity) => unquotedActivities.has(identity))) append(included, raw);
  }
  return { included, excluded };
}
