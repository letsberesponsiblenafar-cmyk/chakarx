import destinationsJson from '@/data/destinations.json';
import routesJson from '@/data/routes.json';
import sourcesJson from '@/data/sources.json';

export type Site = {
  name: string;
  description: string;
  tags: string[];
  months: string;
  season?: string;
  conditional?: boolean;
};

export type Destination = {
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
  local_sightseeing: Array<{ name: string; description: string; tags: string[]; season?: string }>;
  things_to_do: string[];
  activities: string[];
  photoQuery: string;
  sites: Site[];
  base?: boolean;
  cluster: string;
};

export type Route = { km: number; hours: number; source: string; live_required: boolean };
export type Hotel = {
  id: string; destination: string; name: string; sourceCategory: string; starRating: number | null; normalizedCategory: string;
  mapB2B: number | null; extraBedB2B: number | null; cnbB2B: number | null;
  address: string; roomType: string; website: string; sourceType: string; rateValidity: string; availabilityStatus: string;
  lastUpdated: string; sourceFiles: string[]; notes: string; b2bOnly?: boolean;
};
export type Source = { name: string; url: string; type: string; status: string; observed: string; note: string };

export const destinations = destinationsJson as Destination[];
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
export function routeByName(from: string, to: string) { return routes[`${from}|${to}`] ?? null; }
export function hotelById(id: string) { return hotelDatabase.find((h) => h.id === id); }
