import destinationsJson from '@/data/destinations.json';
import routesJson from '@/data/routes.json';
import sourcesJson from '@/data/sources.json';
import planningJson from '@/data/destination-planning.json';

export type VisitWindow = { start: number; end: number };
export type Sightseeing = { name: string; description: string; client_sentence?: string; tags: string[]; season?: string; visit_minutes?: number; transfer_minutes?: number; arrival_suitable?: boolean; cluster?: string; requires_activity?: string; time_window?: VisitWindow };
export type ActivityTiming = { duration_minutes?: number; cluster?: string; sight_names?: string[]; time_window?: VisitWindow };
export type HubRoute = { km: number; hours: number; hours_max: number; reference_point: string; road_endpoint: string; access_mode: 'road' | 'trek' | 'pilgrimage'; trail_hours?: number; via?: string[]; source_urls: string[]; reviewed_at: string; basis: 'published' | 'planning-estimate'; note: string };
type PlanningDefaults = { hub: HubRoute; day_note: string; sights: Record<string, Partial<Sightseeing>>; activities: Record<string, ActivityTiming & { client_sentence: string }> };
const planningDefaults = planningJson as Record<string, PlanningDefaults>;

export type Site = {
  name: string;
  description: string;
  tags: string[];
  months: string;
  season?: string;
  conditional?: boolean;
};

export type Destination = {
  id?: string;
  name: string;
  tier: string;
  district: string;
  tags: string[];
  min_days: number;
  ideal_days: number;
  max_days: number;
  min_nights: number;
  ideal_nights: number;
  max_nights: number;
  overnight_allowed: boolean;
  season: string;
  access: string;
  source: string;
  description: string;
  highlights: string[];
  local_sightseeing: Sightseeing[];
  things_to_do: string[];
  activities: string[];
  activity_copy?: Record<string, string>;
  activity_timing?: Record<string, ActivityTiming>;
  hub_route?: HubRoute;
  photoQuery: string;
  sites: Site[];
  base?: boolean;
  cluster: string;
  srinagar_hours?: number;
  srinagar_km?: number;
  day_note?: string;
  enabled_things_to_do?: string[];
  enabled_sightseeing?: string[];
  enabled_activities?: string[];
  default_inclusions?: string[];
  default_exclusions?: string[];
};

// Keep the shared wording short. Tickets and paid experiences are decided by
// the trip quote, while accommodation, meals and transport remain dynamic.
const standardDestinationPackage = {
  included: ['Sightseeing as detailed in the day-wise itinerary.'],
  excluded: ['Personal expenses such as laundry, shopping and tips.', 'Airfare.', 'Train tickets.'],
};

export function packageTermKey(value: string) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (['airfare', 'flights', 'flight tickets', 'air tickets'].includes(normalized)) return 'airfare';
  if (['train tickets', 'rail tickets', 'railway tickets'].includes(normalized)) return 'train tickets';
  return normalized;
}

export function destinationPackageDefaults(record: Destination) {
  return {
    included: record.default_inclusions ?? standardDestinationPackage.included,
    excluded: record.default_exclusions ?? standardDestinationPackage.excluded,
  };
}

export type Route = { km: number; hours: number; hours_max?: number; access_minutes?: number; source: string; live_required: boolean };
export type Hotel = {
  id: string; destination: string; name: string; sourceCategory: string; starRating: number | null; normalizedCategory: string;
  mapB2B: number | null; extraBedB2B: number | null; cnbB2B: number | null;
  address: string; roomType: string; website: string; sourceType: string; rateValidity: string; availabilityStatus: string;
  lastUpdated: string; sourceFiles: string[]; notes: string; b2bOnly?: boolean;
};
export type Source = { name: string; url: string; type: string; status: string; observed: string; note: string };

// Enrichment is applied to bundled and database records alike. Operator edits,
// explicit empty selections and new custom destinations always take precedence.
export function enrichDestination(record: Destination): Destination {
  const defaults = planningDefaults[record.name];
  const legacy = (destinationsJson as Destination[]).find((item) => item.name === record.name);
  const packageDefaults = destinationPackageDefaults(record);
  const local_sightseeing = record.local_sightseeing.map((sight) => {
    const preset = defaults?.sights[sight.name] || {};
    return { ...preset, ...sight, client_sentence: sight.client_sentence?.trim() || preset.client_sentence || `Visit ${sight.name}.`,
      visit_minutes: sight.visit_minutes ?? preset.visit_minutes,
      transfer_minutes: sight.transfer_minutes ?? preset.transfer_minutes,
      arrival_suitable: sight.arrival_suitable ?? preset.arrival_suitable,
      cluster: sight.cluster || preset.cluster,
      requires_activity: sight.requires_activity ?? (record.activities.includes(preset.requires_activity || '') ? preset.requires_activity : undefined),
      time_window: sight.time_window ?? preset.time_window,
    };
  });
  const activity_copy = { ...record.activity_copy };
  const activity_timing = { ...record.activity_timing };
  for (const name of record.activities) {
    const preset = defaults?.activities[name];
    if (preset) {
      if (!activity_copy[name]?.trim()) activity_copy[name] = preset.client_sentence;
      activity_timing[name] = { ...preset, ...activity_timing[name],
        duration_minutes: activity_timing[name]?.duration_minutes ?? preset.duration_minutes,
        cluster: activity_timing[name]?.cluster || preset.cluster,
        sight_names: (activity_timing[name]?.sight_names ?? preset.sight_names)?.filter((name) => local_sightseeing.some((sight) => sight.name === name)),
        time_window: activity_timing[name]?.time_window ?? preset.time_window,
      };
    }
  }
  const legacyNote = !record.day_note?.trim() || record.day_note === legacy?.day_note || record.day_note === legacy?.description;
  return { ...record, local_sightseeing, activity_copy, activity_timing,
    default_inclusions: [...packageDefaults.included], default_exclusions: [...packageDefaults.excluded],
    day_note: legacyNote && defaults ? defaults.day_note : record.day_note,
    hub_route: record.hub_route || defaults?.hub,
    srinagar_km: record.srinagar_km ?? defaults?.hub.km,
    srinagar_hours: record.srinagar_hours ?? defaults?.hub.hours,
  };
}
export const destinations: Destination[] = (destinationsJson as Destination[]).map(enrichDestination);
export function replaceDestinationCatalog(records: Destination[]) {
  destinations.splice(0, destinations.length, ...records.map(enrichDestination));
}
export const routes = routesJson as Record<string, Route>;
// Hotel master data is fetched from the authenticated server API after sign-in.
export const hotelDatabase: Hotel[] = [];
export const sources = sourcesJson as Source[];

export const hotelCategories = ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'];
export const transportOptions = ['Sedan', 'Ertiga', 'Innova', 'Tempo Traveller'];
export const mealOptions = ['Breakfast Only', 'Breakfast & Dinner', 'None'];
export const travelStyles = ['Relaxed', 'Balanced', 'Packed'] as const;
export const interests = ['Nature', 'Photography', 'Snow', 'Adventure', 'Relaxation', 'Culture', 'Heritage', 'Food', 'Family', 'Trekking', 'Shopping', 'Spirituality', 'Offbeat'] as const;

export const hotels = hotelDatabase.reduce<Record<string, Hotel[]>>((acc, hotel) => {
  (acc[hotel.destination] ||= []).push(hotel);
  return acc;
}, {});

export function destinationByName(name: string) { return destinations.find((d) => d.name === name); }
export function enabledSightseeing(destination: Destination) {
  const names = destination.local_sightseeing.map((sight) => sight.name);
  // Existing library records predate the sightseeing switch. Keep their
  // previously scheduled places available until an operator changes a tick.
  return destination.enabled_sightseeing === undefined
    ? names
    : destination.enabled_sightseeing.filter((name) => names.includes(name));
}
export function routeByName(from: string, to: string) {
  const stored = routes[`${from}|${to}`];
  const custom = from === 'Srinagar' ? destinationByName(to) : to === 'Srinagar' ? destinationByName(from) : null;
  if (custom && custom.srinagar_hours !== undefined && (custom.srinagar_km !== undefined || stored?.km)) return {
    hours: custom.srinagar_hours, hours_max: Math.max(custom.srinagar_hours, custom.hub_route?.hours_max || custom.srinagar_hours), km: custom.srinagar_km ?? stored!.km,
    access_minutes: custom.hub_route?.access_mode !== 'road' ? Math.round((custom.hub_route?.trail_hours || 0) * 60) : 0,
    source: custom.hub_route ? `${custom.hub_route.basis === 'published' ? 'Published route' : 'Planning estimate'} · ${custom.hub_route.road_endpoint}` : 'Destination library route', live_required: true,
  };
  return stored || null;
}
export function hotelById(id: string) { return hotelDatabase.find((h) => h.id === id); }
