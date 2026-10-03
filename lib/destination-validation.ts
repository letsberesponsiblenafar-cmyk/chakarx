import type { Destination } from '@/lib/data';

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
  if (value === undefined || value === '') return undefined;
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > 2000) throw new Error(`${label} must be a positive number.`);
  return result;
};

export function validateDestination(raw: unknown): Destination {
  if (!raw || typeof raw !== 'object') throw new Error('Destination details are required.');
  const d = raw as Record<string,unknown>;
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
    return { name: string(sight.name, 'Sight name', 120), description: string(sight.description, 'Sight description', 800), tags: list(sight.tags, 'Sight tags'), season: string(sight.season ?? 'all', 'Sight season', 80) };
  }).filter((sight) => sight.name);
  const things_to_do = list(d.things_to_do, 'Things to do');
  const activities = list(d.activities, 'Popular activities');
  const enabled_things_to_do = list(d.enabled_things_to_do ?? [], 'Enabled things to do').filter((x) => things_to_do.includes(x));
  const enabled_activities = list(d.enabled_activities ?? [], 'Enabled activities').filter((x) => activities.includes(x));
  return {
    id, name, tier: string(d.tier, 'Tier', 80), district: string(d.district, 'District', 100), tags: list(d.tags, 'Tags'),
    min_days, ideal_days, max_days, min_nights, ideal_nights, max_nights,
    overnight_allowed: Boolean(d.overnight_allowed), season: string(d.season, 'Season', 80), access: string(d.access, 'Access', 80),
    source: string(d.source, 'Source', 200), description: string(d.description, 'Description', 2500), day_note: string(d.day_note ?? '', 'About this day', 2500),
    highlights: list(d.highlights, 'Highlights'), local_sightseeing, things_to_do, activities, enabled_things_to_do, enabled_activities,
    photoQuery: string(d.photoQuery, 'Photo query', 150), sites: Array.isArray(d.sites) ? d.sites as Destination['sites'] : [],
    base: Boolean(d.base), cluster: string(d.cluster, 'Cluster', 80),
    srinagar_hours: distance(d.srinagar_hours, 'Drive hours from Srinagar'),
    srinagar_km: distance(d.srinagar_km, 'Distance from Srinagar'),
  };
}
