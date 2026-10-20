import { enrichDestination, packageTermKey, type Destination, type HubRoute, type VisitWindow } from '@/lib/data';

const string = (value: unknown, label: string, max = 500) => {
  if (typeof value !== 'string' || value.trim().length > max) throw new Error(`${label} must be text under ${max} characters.`);
  return value.trim();
};
const list = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.length > 80) throw new Error(`${label} must be a list of up to 80 items.`);
  return value.map((item) => string(item, label, 300)).filter(Boolean);
};
const count = (value: unknown, label: string) => {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 30) throw new Error(`${label} must be between 0 and 30.`);
  return result;
};
const distance = (value: unknown, label: string) => {
  if (value === undefined || value === '' || value === null) return undefined;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 2000) throw new Error(`${label} must be a non-negative number under 2000.`);
  return result;
};
const minutes = (value: unknown, label: string, allowZero = false) => {
  if (value === undefined || value === '' || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < (allowZero ? 0 : 5) || number > 14400) throw new Error(`${label} must be whole minutes between ${allowZero ? 0 : 5} and 14400.`);
  return number;
};
function unique(names: string[], label: string) {
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error(`${label} names must be unique.`);
}
function visitWindow(raw: unknown): VisitWindow | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') throw new Error('Visit window must have a start and end minute.');
  const { start, end } = raw as VisitWindow;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || start >= end) throw new Error('Visit window must be an ordered time range within one day.');
  return { start, end };
}
function hubRoute(raw: unknown): HubRoute | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const route = raw as Record<string, unknown>;
  const km = distance(route.km, 'Hub distance'); const hours = distance(route.hours, 'Hub drive hours');
  const hours_max = distance(route.hours_max, 'Maximum drive hours');
  if (km === undefined || hours === undefined || hours_max === undefined || hours_max < hours) throw new Error('Route distance and an ordered drive-time range are required.');
  if (!['road','trek','pilgrimage'].includes(String(route.access_mode))) throw new Error('Invalid destination access mode.');
  const source_urls = list(route.source_urls || [], 'Route sources');
  for (const url of source_urls) { try { if (new URL(url).protocol !== 'https:') throw new Error(); } catch { throw new Error('Route sources must be HTTPS URLs.'); } }
  return { km, hours, hours_max, reference_point: string(route.reference_point, 'Route starting point', 200), road_endpoint: string(route.road_endpoint, 'Road endpoint', 200),
    access_mode: route.access_mode as HubRoute['access_mode'], trail_hours: distance(route.trail_hours, 'Trail hours'), via: list(route.via || [], 'Route via'),
    source_urls, reviewed_at: string(route.reviewed_at || '', 'Route review date', 20), basis: route.basis === 'published' ? 'published' : 'planning-estimate', note: string(route.note || '', 'Route notes', 2000) };
}

export function validateDestination(raw: unknown): Destination {
  if (!raw || typeof raw !== 'object') throw new Error('Destination details are required.');
  const d = raw as Record<string,unknown>;
  if (d.day_note_mode !== undefined && d.day_note_mode !== 'auto' && d.day_note_mode !== 'manual') throw new Error('Choose automatic or manual About text.');
  const id = string(d.id, 'Destination ID', 100);
  const name = string(d.name, 'Destination name', 100);
  if (!id || !name) throw new Error('Destination ID and name are required.');
  const min_days = count(d.min_days, 'Minimum days');
  const ideal_days = count(d.ideal_days, 'Ideal days');
  const max_days = count(d.max_days, 'Maximum days');
  const min_nights = count(d.min_nights, 'Minimum nights');
  const ideal_nights = count(d.ideal_nights, 'Ideal nights');
  const max_nights = count(d.max_nights, 'Maximum nights');
  if (min_days > ideal_days || ideal_days > max_days || min_nights > ideal_nights || ideal_nights > max_nights) throw new Error('Minimum, ideal and maximum day/night values must be in order.');
  if (!Array.isArray(d.local_sightseeing) || d.local_sightseeing.length > 80) throw new Error('Sightseeing must be a list.');
  const local_sightseeing = d.local_sightseeing.map((item) => {
    const sight = item as Record<string,unknown>;
    // A legacy fallback contains its 120-character name and 800-character
    // description plus short connective wording. It must remain saveable.
    return { name: string(sight.name, 'Sight name', 120), description: string(sight.description ?? '', 'Sight description', 800), client_sentence: string(sight.client_sentence ?? '', 'Client sightseeing sentence', 1000), tags: list(sight.tags || [], 'Sight tags'), season: string(sight.season ?? 'all', 'Sight season', 80),
      visit_minutes: minutes(sight.visit_minutes, 'Visit duration'), transfer_minutes: minutes(sight.transfer_minutes, 'Local transfer duration', true), arrival_suitable: typeof sight.arrival_suitable === 'boolean' ? sight.arrival_suitable : undefined,
      cluster: string(sight.cluster || '', 'Sight area', 120), requires_activity: sight.requires_activity === undefined ? undefined : string(sight.requires_activity || '', 'Required activity', 300), time_window: visitWindow(sight.time_window) };
  }).filter((sight) => sight.name);
  const sightNames = local_sightseeing.map((sight) => sight.name);
  unique(sightNames, 'Sightseeing');
  const enabled_sightseeing = d.enabled_sightseeing === undefined ? undefined
    : list(d.enabled_sightseeing, 'Enabled sightseeing').filter((name) => sightNames.includes(name));
  // Retain the legacy fields for old saved records, but derive them from the
  // single editable sightseeing list whenever a destination is saved.
  const things_to_do = sightNames;
  const activities = list(d.activities, 'Popular activities');
  unique(activities, 'Activity');
  const enabled_things_to_do = enabled_sightseeing ?? sightNames;
  const enabled_activities = list(d.enabled_activities ?? [], 'Enabled activities').filter((x) => activities.includes(x));
  const default_inclusions = d.default_inclusions === undefined ? undefined : list(d.default_inclusions, 'Default inclusions');
  const default_exclusions = d.default_exclusions === undefined ? undefined : list(d.default_exclusions, 'Default exclusions');
  unique(default_inclusions || [], 'Default inclusion');
  unique(default_exclusions || [], 'Default exclusion');
  const inclusionKeys = new Set((default_inclusions || []).map(packageTermKey));
  if ((default_exclusions || []).some((item) => inclusionKeys.has(packageTermKey(item)))) throw new Error('The same item cannot be both a default inclusion and exclusion.');
  const rawActivityCopy = d.activity_copy && typeof d.activity_copy === 'object' && !Array.isArray(d.activity_copy) ? d.activity_copy as Record<string, unknown> : {};
  const activity_copy = Object.fromEntries(activities.map((name) => [name, string(rawActivityCopy[name] ?? '', `${name} client sentence`, 500)]));
  const rawTiming = d.activity_timing && typeof d.activity_timing === 'object' ? d.activity_timing as Record<string, Record<string, unknown>> : {};
  const activity_timing = Object.fromEntries(activities.map((name) => { const timing = rawTiming[name] || {}; return [name, { duration_minutes: minutes(timing.duration_minutes, `${name} duration`), time_window: visitWindow(timing.time_window), cluster: string(timing.cluster || '', 'Activity area', 120), sight_names: timing.sight_names === undefined ? undefined : list(timing.sight_names, 'Activity sightseeing').filter((sight) => sightNames.includes(sight)) }]; }));
  for (const sight of local_sightseeing) if (sight.requires_activity && !activities.includes(sight.requires_activity)) throw new Error(`${sight.name}: choose an existing required activity.`);
  return enrichDestination({
    id, name, tier: string(d.tier, 'Tier', 80), district: string(d.district, 'District', 100), tags: list(d.tags, 'Tags'),
    min_days, ideal_days, max_days, min_nights, ideal_nights, max_nights,
    overnight_allowed: Boolean(d.overnight_allowed), season: string(d.season, 'Season', 80), access: string(d.access, 'Access', 80),
    source: string(d.source, 'Source', 200), description: string(d.description, 'Description', 2500), day_note: d.day_note == null ? undefined : string(d.day_note, 'About this day', 2500), day_note_mode: d.day_note_mode as Destination['day_note_mode'],
    highlights: list(d.highlights, 'Highlights'), local_sightseeing, things_to_do, activities, activity_copy, activity_timing, hub_route: hubRoute(d.hub_route), enabled_things_to_do, enabled_sightseeing, enabled_activities, default_inclusions, default_exclusions,
    photoQuery: string(d.photoQuery, 'Photo query', 150), sites: Array.isArray(d.sites) ? d.sites as Destination['sites'] : [],
    base: Boolean(d.base), cluster: string(d.cluster, 'Cluster', 80),
    srinagar_hours: distance(d.srinagar_hours, 'Drive hours from Srinagar'),
    srinagar_km: distance(d.srinagar_km, 'Distance from Srinagar'),
  });
}
