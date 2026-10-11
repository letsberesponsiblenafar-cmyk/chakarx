import { packageTermKey } from '@/lib/data';

export type PackageDefaults = { included: string[]; excluded: string[] };
export const PACKAGE_DEFAULTS_RECORD_ID = '__chakar_package_defaults__';

// These are itinerary-wide terms. Accommodation, transport and meals remain
// generated from the quote; paid activities keep their explicit decisions.
export function initialPackageDefaults(): PackageDefaults {
  return {
    included: ['Sightseeing as detailed in the day-wise itinerary.'],
    excluded: ['Personal expenses such as laundry, shopping and tips.', 'Airfare.', 'Train tickets.'],
  };
}

export function validatePackageDefaults(raw: unknown): PackageDefaults {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Package defaults must contain inclusion and exclusion lists.');
  const value = raw as Record<string, unknown>;
  const list = (items: unknown, label: string) => {
    if (!Array.isArray(items) || items.length > 80) throw new Error(`${label} must be a list of up to 80 lines.`);
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (typeof item !== 'string' || item.trim().length > 300) throw new Error(`${label} lines must be text under 300 characters.`);
      const text = item.trim(); const key = packageTermKey(text);
      if (key && !seen.has(key)) { result.push(text); seen.add(key); }
    }
    return result;
  };
  const included = list(value.included, 'Default inclusions');
  const excluded = list(value.excluded, 'Default exclusions');
  const inclusionKeys = new Set(included.map(packageTermKey));
  if (excluded.some((item) => inclusionKeys.has(packageTermKey(item)))) throw new Error('The same item cannot be both a default inclusion and exclusion.');
  return { included, excluded };
}
