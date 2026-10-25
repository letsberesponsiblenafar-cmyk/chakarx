import { destinationByName, destinations, withDestinationCatalog, hotelCategories, interests, mealOptions, routeByName, transportOptions, travelStyles } from '@/lib/data';
import type { Destination, Route, Site, Hotel } from '@/lib/data';
import { firstHotelCandidate, roomsRequired, cnbChildren, extraBedsRequired } from '@/lib/hotels';
import { destinationPriority, recommendationWeight, isGurezAllowed, shouldPreferOffbeat, destinationAccessFlags, engineRules } from '@/lib/intelligence';
import { journeyDrive, routeLeg } from '@/lib/journey-drive';
import { seasonMatches } from '@/lib/seasons';
import { priceTrip } from '@/lib/pricing';
import { scheduleDayPlans, type ScheduleQuote } from '@/lib/day-scheduler';
import { snapshotPlanDestinations, srinagarLogisticsGuide, withPlanDestinations } from '@/lib/plan-destinations';
import { packageCategories } from '@/lib/package-quotes';
import { utcDay } from '@/lib/trip-dates';
import type { PackageDefaults } from '@/lib/package-defaults';
import { resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';
import { validatePdfDesign, type PdfDesignSettings } from '@/lib/pdf-designs';

export type TripInput = {
  name: string; arrival: string; departure: string; arrivalTime?: string; departureTime?: string; pickup: string; adults: number; youngAges: number[]; budget: number;
  hotelCategory: string; transport: string; mealPlan: string; style: typeof travelStyles[number]; interests: string[];
  hotelOptionMode?: 'single' | 'multiple';
  packagePreferences?: string[];
  /** Presentation only; it never changes the route, services or quote. */
  pdfTheme?: PdfThemeId;
  /** Immutable visual settings for this trip; never changes route or costing. */
  pdfDesign?: PdfDesignSettings;
};
export type RouteLeg = Route & { from: string; to: string; via?: string[]; known: boolean; preference: 'PREFERRED' | 'ALLOWED' | 'AVOID' | 'NOT_ALLOWED'; vehicleDaysCharged: number; rationale: string; preferredAlternative?: string };
export type DayBlock = { name: string; description: string; startMinute?: number; reason: string; tags: string[]; destination?: string; sights?: string[]; librarySights?: { destination: string; name: string; visitName: string }[]; source?: string; conditional?: boolean; kind?: 'sightseeing' | 'arrival' | 'transfer' | 'departure' | 'custom' | 'free-time'; intelligence?: { status: 'STANDARD' | 'OPTIONAL' | 'CONDITIONAL' | 'EXTRA' | 'EXCLUDED' | 'SEASONAL' | 'LIVE_CHECK'; extraCost?: boolean; note?: string } };
export type ScheduledActivity = { key: string; destination: string; name: string; minutes: number };
export type DayTiming = { startMinutes: number; endMinutes: number; availableMinutes: number; driveMinutes: number; serviceMinutes: number; scheduledMinutes: number; remainingMinutes: number; overrunMinutes?: number; issues: string[]; advisories?: string[] };
export type DayPlan = { day: number; date: string; label: string; from: string; to: string; stay: string; transfer: boolean; drive: RouteLeg; blocks: DayBlock[]; notes: string[]; arrivalTime?: string; departureTime?: string; dayTripDestination?: string | null; additionalVisitDestinations?: string[]; primaryVisitFor?: string[]; customTitle?: string; customAbout?: string; customAboutContext?: string; previousCustomAbout?: string; scheduledActivities?: ScheduledActivity[]; timing?: DayTiming };
export type Stay = { name: string; nights: number; destination: Destination };
export type HotelCandidate = Hotel;
export type HotelPlan = { location: string; nights: number; candidate: HotelCandidate | null };
export type Plan = {
  input: TripInput; nights: number; days: number; stays: Stay[]; dayPlans: DayPlan[]; routeKm: number; driveHours: number; hotelChanges: number; travelLoad: 'Light' | 'Moderate' | 'Heavy';
  estimatedTotal: number; rangeLow: number; rangeHigh: number; costs: { accommodation: number; transport: number; meals: number; activities: number; contingency: number };
  hotelPlans: HotelPlan[]; evaluation: { budgetFit: string; season: string; capacity: string; route: string; dataConfidence: string; alerts: string[]; ruleTrace: string[]; exclusions: string[] };
  destinationSnapshot?: Destination[];
  /** Saved trips use their own reference data until the operator updates them. */
  referenceMode?: 'saved';
  hotelSnapshot?: Hotel[];
  packageDefaultsSnapshot?: PackageDefaults;
};

export const ROUTE_VERSION = 'kashmir-balanced-visits-2026-10-13';
const transportRates: Record<string, number> = { Sedan: 3400, Ertiga: 4200, Innova: 5200, 'Tempo Traveller': 7600 };

function daysBetween(a: string, b: string) {
  const start = utcDay(a), end = utcDay(b);
  return start === null || end === null ? NaN : (end - start) / 86400000;
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function dateAt(date: string, offset: number) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10);
}
function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function normalizeChildrenAndAdults(adults: number, ages: number[]) {
  let adultCount = Math.max(1, Number.isFinite(adults) ? adults : 1);
  const children: number[] = [];
  for (const raw of ages) {
    const age = Math.round(raw);
    if (!Number.isFinite(age) || age < 0) continue;
    if (age > 14) adultCount += 1;
    else children.push(Math.min(14, age));
  }
  return { adults: adultCount, children };
}
function safeYoungAges(ages: number[]) { return normalizeChildrenAndAdults(1, ages).children; }

export function tripNights(input: Pick<TripInput, 'arrival' | 'departure'>) { return daysBetween(input.arrival, input.departure); }
export function seasonForDate(date: string) {
  const m = new Date(`${date}T12:00:00`).getMonth() + 1;
  if ([12, 1, 2].includes(m)) return 'winter';
  if ([3, 4, 5].includes(m)) return 'spring';
  if ([6, 7, 8].includes(m)) return 'summer';
  return 'autumn';
}
function monthNumber(date: string) { return new Date(`${date}T12:00:00`).getMonth() + 1; }
function seasonFit(d: Destination | Site, date: string) {
  const season = String('season' in d ? d.season : d.months);
  return seasonMatches(season, date) === true ? 1 : 0.45;
}

function scoredDestination(d: Destination, input: TripInput, date: string) {
  const season = seasonFit(d, date); const tagSet = new Set(input.interests.map((x) => x.toLowerCase()));
  if (d.name === 'Gurez' && !isGurezAllowed(date)) return -10000;
  const priority = destinationPriority(d.name);
  let score = season * 20 + recommendationWeight(d.name) * 0.18;
  score += d.tags.reduce((sum, t) => sum + (tagSet.has(t.toLowerCase()) ? 7 : 0), 0);
  if (priority === 'CORE') score += 16;
  if (priority === 'SECONDARY') score += 4;
  if (priority === 'OFFBEAT') score += shouldPreferOffbeat({ interests: input.interests, nights: tripNights(input) }) ? 7 : -8;
  if (priority === 'LOW_PRIORITY') score += shouldPreferOffbeat({ interests: input.interests, nights: tripNights(input) }) ? 2 : -15;
  if (input.style === 'Relaxed' && d.access === 'weather-sensitive') score -= 2;
  if (input.youngAges.length > 0) {
    const youngest = Math.min(...input.youngAges);
    if (youngest <= 5 && d.tags.includes('trekking')) score -= 10;
    if (d.tags.includes('family')) score += 6;
  }
  return score;
}

function minutesOfDay(value?: string) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Flights/trains leaving by 2 pm require the preceding hotel night in Srinagar. */
export function requiresSrinagarFinalNight(input: Pick<TripInput, 'departureTime'>) {
  const departure = minutesOfDay(input.departureTime);
  return departure !== null && departure <= 14 * 60;
}

function departureNightSequence(input: TripInput, sequence: string[]) {
  const nights = [...sequence];
  if (nights.length && requiresSrinagarFinalNight(input)) nights[nights.length - 1] = 'Srinagar';
  return nights;
}

export function arrivalDayVisitAllowed(input: TripInput, destination: string) {
  // The early-arrival excursion assumes arrival in Srinagar, not a Jammu
  // road transfer or an unmeasured custom pickup.
  if (!input.pickup.toLowerCase().includes('srinagar')) return false;
  const arrival = minutesOfDay(input.arrivalTime);
  const outward = routeByName('Srinagar', destination);
  if (arrival === null || !outward || arrival > 7 * 60 + 30) return false;
  // Arrival formalities, both road legs and a modest visit must fit before evening.
  return arrival + 90 + outward.hours * 120 + 120 <= 18 * 60;
}

const essentialVisits = ['Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri', 'Naranag'];

function chooseDayTrip(base: Destination, visited: Set<string>, date: string, input: TripInput) {
  if (base.name !== 'Srinagar') return null;
  const candidates = destinations.filter((d) => !d.library_archived && d.name !== 'Srinagar' && !visited.has(d.name) && d.base && (!d.hub_route || d.hub_route.access_mode === 'road') && (routeByName('Srinagar', d.name)?.hours || 99) <= 3.5);
  const allowed = candidates.filter((d) => {
    if (d.name === 'Gurez') return isGurezAllowed(date);
    if (d.name === 'Doodhpathri') return seasonForDate(date) !== 'winter';
    if (['Gulmarg', 'Pahalgam', 'Sonamarg'].includes(d.name)) return true;
    return seasonFit(d, date) >= 0.9;
  });
  // Once the three headline excursions have overnight stays, give a spare
  // Srinagar day to Naranag before adding another western excursion.
  const priority = ['Gulmarg', 'Pahalgam', 'Sonamarg'].every((name) => visited.has(name)) && tripNights(input) >= 6
    ? ['Naranag', ...essentialVisits.filter((name) => name !== 'Naranag')]
    : essentialVisits;
  return allowed.sort((a, b) => {
    const aRank = priority.indexOf(a.name), bRank = priority.indexOf(b.name);
    if (aRank !== bRank) return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank);
    return scoredDestination(b, input, date) - scoredDestination(a, input, date);
  })[0] || null;
}

// Each outlying overnight needs its own return to the Srinagar hub. A spare
// day is more useful as a proper excursion than as another cross-valley hotel
// transfer, so add overnight bases only when both legs fit the trip.
function recommendedNightSequence(input: TripInput) {
  const nights = tripNights(input);
  const days = nights + 1;
  if (days <= 5) return Array.from({ length: nights }, () => 'Srinagar');

  const sequence = ['Srinagar'];
  // Eight days need a mix of stays and excursions. Giving all three valleys
  // an overnight consumes every usable day on outward/return pairs. Reserve
  // two hub days here: the remaining core valley plus a new destination.
  const excursionReserve = days >= 8 ? 1 : 0;
  const stayPairCapacity = Math.floor((nights - 1 - excursionReserve) / 2);
  const coreCount = Math.min(3, days - 5, stayPairCapacity);
  const core = ['Gulmarg', 'Pahalgam', 'Sonamarg'].slice(0, coreCount);
  const addStay = (name: string) => {
    const destination = destinationByName(name);
    const route = routeByName('Srinagar', name);
    if (!destination?.overnight_allowed || destination.library_archived || !route || destination.hub_route?.access_mode && destination.hub_route.access_mode !== 'road') return false;
    sequence.push(name, 'Srinagar'); return true;
  };
  core.forEach(addStay);
  // Doodhpathri is a later, date-sensitive overnight. Never squeeze it into
  // the core circuit or a winter recommendation.
  // Retain a full excursion day before turning another day visit into a stay.
  // Doodhpathri can be visited on a ten-day route and becomes an overnight
  // when its return and the extra excursion both fit.
  if (days >= 10 && seasonForDate(input.arrival) !== 'winter' && sequence.length + 3 <= nights) addStay('Doodhpathri');

  let remaining = nights - sequence.length;
  // Keep one full Srinagar-based day for Naranag or another suitable visit.
  if (remaining > 0) { sequence.push('Srinagar'); remaining--; }
  const extras = destinations
    .filter((d) => !d.library_archived && d.base && d.overnight_allowed && d.min_nights <= 1 && !sequence.includes(d.name) && (!d.hub_route || d.hub_route.access_mode === 'road'))
    .filter((d) => d.name !== 'Srinagar' && d.name !== 'Naranag' && d.cluster !== 'central')
    .filter((d) => (routeByName('Srinagar', d.name)?.hours || 99) <= 4 && seasonFit(d, input.arrival) >= 0.9)
    .sort((a, b) => scoredDestination(b, input, input.arrival) - scoredDestination(a, input, input.arrival));
  if (remaining >= 2 && extras.length) { addStay(extras.shift()!.name); remaining -= 2; }
  if (remaining > 0 && days >= 14) {
    const extend = ['Pahalgam', 'Gulmarg', 'Sonamarg', 'Doodhpathri'].find((name) =>
      sequence.includes(name) && !destinationByName(name)?.library_archived && sequence.filter((stay) => stay === name).length < (destinationByName(name)?.max_nights || 1));
    if (extend) { sequence.splice(sequence.lastIndexOf(extend) + 1, 0, extend); remaining--; }
  }
  while (remaining >= 2 && extras.length) { addStay(extras.shift()!.name); remaining -= 2; }
  while (remaining-- > 0) sequence.push('Srinagar');
  return sequence;
}

function arrivalBlock(input: TripInput, stay: string, date: string): DayBlock {
  const pickup = input.pickup?.trim() || 'the selected pick-up point';
  const arrivalPlace = pickup.toLowerCase().includes('other') ? pickup : pickup;
  const routed = arrivalPlace.toLowerCase() !== stay.toLowerCase();
  const sightseeing = stay === 'Srinagar' ? 'local sightseeing' : `${stay} sightseeing`;
  return {
    name: routed ? `Arrival in ${arrivalPlace} · onward to ${stay}` : `Arrival in ${stay}`,
    description: routed
      ? `The day begins with the client's arrival at ${arrivalPlace}, followed by the planned transfer towards ${stay}. Time is kept flexible for check-in, settling in and ${sightseeing}.`
      : `The client arrives in ${stay}. After arrival and check-in, the remaining time is reserved for a relaxed introduction to ${stay} and ${sightseeing}.` ,
    reason: `Arrival flow is derived from the traveller's selected pick-up point (${pickup}) and the first overnight destination (${stay}).`,
    tags: ['arrival', 'local-sightseeing'],
    kind: 'arrival',
    intelligence: { status: 'STANDARD', note: `Arrival point: ${pickup}.` },
    source: 'Chakar itinerary flow',
  };
}

function buildDays(input: TripInput, nightSequence: string[], departurePoint = 'Srinagar', dayTrips: Record<number, string | null> = {}) {
  const nights = nightSequence.length; const days: DayPlan[] = [];
  const visited = new Set(nightSequence);
  for (let index = 0; index <= nights; index++) {
    const date = dateAt(input.arrival, index);
    if (index === nights) {
      const stay = nightSequence[nights - 1] || 'Srinagar';
      const drive = routeLeg(stay, departurePoint);
      days.push({ day: index + 1, date, label: 'Departure day', from: stay, to: departurePoint, stay, transfer: stay !== departurePoint, drive, blocks: [], departureTime: input.departureTime, notes: [] });
      continue;
    }
    const stay = nightSequence[index] || 'Srinagar'; const previous = index === 0 ? (input.pickup.toLowerCase().includes('srinagar') ? 'Srinagar' : input.pickup) : (nightSequence[index - 1] || stay);
    const base = destinationByName(stay)!; const transfer = index === 0 ? true : stay !== previous;
    let drive = routeLeg(previous, stay);
    const arrival = index === 0 ? [arrivalBlock(input, stay, date)] : [];
    const override = dayTrips[index + 1];
    // A four-day trip has only two full sightseeing days. Show the third core
    // visit on arrival with an explicit early-arrival condition, never as an
    // unconditional promise about an unknown flight or train time.
    const arrivalVisit = index === 0 && stay === 'Srinagar'
      ? destinationByName(nights === 3 ? 'Gulmarg' : '')
      : null;
    const feasibleArrivalVisit = arrivalVisit && !arrivalVisit.library_archived && arrivalDayVisitAllowed(input, arrivalVisit.name) ? arrivalVisit : null;
    const excursion = override === null ? null : override ? destinationByName(override)
      : feasibleArrivalVisit || (!transfer ? chooseDayTrip(base, visited, date, input) : null);
    const blocks = [...arrival];
    let dayTripDestination: string | null | undefined;
    dayTripDestination = excursion?.name ?? (override === null ? null : undefined);
    if (excursion && excursion.name !== stay) {
        visited.add(excursion.name);
        drive = journeyDrive(previous, stay, excursion.name);
    }
    const accessFlags = destinationAccessFlags(stay);
    const notes = transfer ? ['Road movement and sightseeing are combined; verify live road conditions before confirmation.'] : [];
    if (index === 0 && excursion) notes.push(`${excursion.name} on arrival day requires an early arrival and a live travel-time check. Move this visit to an added day if the arrival is later.`);
    if (drive.preference === 'AVOID') notes.push(drive.rationale);
    if (accessFlags.includes('LIVE_CHECK')) notes.push(`${stay} requires a live/manual access check before confirmation.`);
    if (stay === 'Gurez' && !isGurezAllowed(date)) notes.push('Gurez is blocked outside the May-October planning window.');
    days.push({
      day: index + 1, date, label: index === 0 ? 'Arrival day' : transfer ? 'Move & explore' : 'Explore',
      from: previous === stay ? stay : previous, to: stay, stay, transfer, drive, dayTripDestination,
      blocks, notes, arrivalTime: index === 0 ? input.arrivalTime : undefined,
    });
  }
  return scheduleDayPlans(input, days);
}

function groupedStays(nightSequence: string[]) {
  const out: { name: string; nights: number }[] = [];
  for (const name of nightSequence) {
    const last = out[out.length - 1];
    if (last && last.name === name) last.nights++;
    else out.push({ name, nights: 1 });
  }
  return out;
}

function makeHotelPlans(nightSequence: string[], hotelCategory: string) {
  const totals = new Map<string, number>();
  for (const name of nightSequence) totals.set(name, (totals.get(name) || 0) + 1);
  return [...totals.entries()].map(([location, nights]) => ({ location, nights, candidate: firstHotelCandidate(location, hotelCategory) }));
}

function metrics(days: DayPlan[], nights: number) {
  const routeKm = days.reduce((s, d) => s + (d.drive.km || 0), 0);
  const driveHours = days.reduce((s, d) => s + (d.drive.hours || 0), 0);
  const avgDrive = nights ? driveHours / nights : 0; const maxDrive = Math.max(0, ...days.map((d) => d.drive.hours || 0));
  const travelLoad: Plan['travelLoad'] = maxDrive > 4.5 || avgDrive > 3.3 ? 'Heavy' : avgDrive > 2 ? 'Moderate' : 'Light';
  return { routeKm, driveHours, travelLoad };
}

function validateInput(input: TripInput) {
  if (!input || typeof input !== 'object') throw new Error('Trip details are required.');
  if (!input.arrival || !input.departure) throw new Error('Arrival and departure dates are required.');
  for (const value of [input.arrivalTime, input.departureTime]) if (value && minutesOfDay(value) === null) throw new Error('Enter valid arrival and departure times.');
  if (utcDay(input.arrival) === null || utcDay(input.departure) === null) throw new Error('Please provide valid calendar dates.');
  const nights = tripNights(input);
  if (nights < 1) throw new Error('Departure date must be after arrival date.');
  if (nights > 30) throw new Error('Chakar Experience currently supports trips up to 30 nights.');
  if (!Number.isInteger(input.adults) || input.adults < 1) throw new Error('Enter a whole number of adults, at least 1.');
  if (!Array.isArray(input.youngAges)) throw new Error('Child ages must be supplied as a list.');
  if (input.youngAges.some((age) => !Number.isInteger(age) || age < 0 || age > 99)) throw new Error('Child ages must be whole numbers from 0 to 99.');
  if (!Array.isArray(input.interests)) throw new Error('Interests must be supplied as a list.');
  if (!travelStyles.includes(input.style)) throw new Error('Invalid itinerary configuration.');
  if (!hotelCategories.includes(input.hotelCategory)) throw new Error('Invalid itinerary category.');
  if (input.packagePreferences !== undefined && (!Array.isArray(input.packagePreferences) || input.packagePreferences.length < 1 || input.packagePreferences.length > hotelCategories.length || input.packagePreferences.some((category) => !hotelCategories.includes(category)) || new Set(input.packagePreferences).size !== input.packagePreferences.length)) throw new Error('Choose one or more valid package preferences.');
  if (typeof input.transport !== 'string' || !input.transport.trim() || input.transport.length > 80) throw new Error('Enter a valid vehicle name.');
  if (!mealOptions.includes(input.mealPlan)) throw new Error('Invalid meal plan.');
  if (input.hotelOptionMode !== undefined && !['single', 'multiple'].includes(input.hotelOptionMode)) throw new Error('Choose one hotel or multiple hotel options.');
  if (!Number.isFinite(input.budget) || input.budget < 0) throw new Error('Budget must be a valid non-negative amount.');
}

export function validatedTripInput(input: TripInput): TripInput {
  validateInput(input);
  const normalizedMix = normalizeChildrenAndAdults(input.adults, input.youngAges);
  if (input.pdfDesign !== undefined) validatePdfDesign(input.pdfDesign);
  return { ...input, ...(input.packagePreferences ? { packagePreferences: packageCategories(input), hotelCategory: packageCategories(input)[0] } : {}), pdfTheme: resolvePdfTheme(input.pdfTheme).id, hotelOptionMode: input.hotelOptionMode || 'single', youngAges: normalizedMix.children, adults: normalizedMix.adults, budget: Math.max(0, input.budget) };
}

export function createPlan(input: TripInput, catalog?: Destination[]): Plan {
  if (catalog) {
    // Planning is synchronous: scope the request's shared library to this call,
    // restoring the module's catalog before another request can run.
    return withDestinationCatalog(catalog, () => createPlan(input));
  }
  if (!destinationByName('Srinagar') || destinationByName('Srinagar')?.library_archived) return withDestinationCatalog([...destinations.filter((destination) => destination.name !== 'Srinagar'), srinagarLogisticsGuide()], () => createPlan(input));
  const normalized = validatedTripInput(input);
  const nights = tripNights(normalized);
  const nightSequence = departureNightSequence(normalized, recommendedNightSequence(normalized));
  const dayPlans = buildDays(normalized, nightSequence);
  const staySegments = groupedStays(nightSequence);
  const hotelPlans = makeHotelPlans(nightSequence, normalized.hotelCategory);
  const m = metrics(dayPlans, nights);
  const rooms = roomsRequired(normalized.adults);
  const extraBeds = extraBedsRequired(normalized.youngAges); const cnb = cnbChildren(normalized.youngAges);
  const accommodation = hotelPlans.reduce((sum, h) => sum + h.nights * (h.candidate?.mapB2B ?? 0) * rooms + h.nights * (h.candidate?.extraBedB2B ?? 0) * extraBeds + h.nights * (h.candidate?.cnbB2B ?? 0) * cnb, 0);
  // This is only a starting quote. The operator's selected hotels and edits are
  // priced again from current state in calculateCosts, using the same formula.
  const estimated = priceTrip({ accommodation, vehicleDays: dayPlans.length, transportDaily: transportRates[normalized.transport] ?? transportRates.Ertiga, other: 0, profitPct: 10 });
  const total = estimated.sellingTotal;
  const low = estimated.low; const high = estimated.high;
  const missingRateHotels = hotelPlans.filter((h) => !h.candidate?.mapB2B).map((h) => h.location);
  const alerts: string[] = [];
  if (nights <= 3 && !dayPlans[0].dayTripDestination) alerts.push('The arrival-day excursion was omitted because an early arrival was not supplied or the drive cannot fit. Add a day or adjust the route if all core visits are required.');
  const ruleTrace = engineRules().map((x) => x.rule);
  const exclusions = ['Pony rides', 'ATV rides', 'Seasonal snow activities', 'Union/local cabs', 'Personal expenses', 'Gondola tickets'];
  if (missingRateHotels.length) alerts.push(`B2B MAP rates are missing for: ${missingRateHotels.join(', ')}. Verify rates before confirmation.`);
  const budgetTotal = normalized.budget * (normalized.adults + normalized.youngAges.length);
  if (budgetTotal > 0 && total > budgetTotal) alerts.push(`Planning baseline is above the entered per-person budget by about ₹${Math.round(total - budgetTotal).toLocaleString('en-IN')} for the group.`);
  if (m.travelLoad === 'Heavy') alerts.push('The route contains a high movement burden; live routing and road conditions should be checked before confirmation.');
  if (['winter', 'spring'].includes(seasonForDate(input.arrival))) alerts.push('Some mountain activities and access points are seasonal; perform a date-specific operating check.');
  for (const name of [...new Set(nightSequence)]) {
    const destination = destinationByName(name);
    if (destination && seasonFit(destination, input.arrival) < 0.9) alerts.push(`${name} overnight is outside its preferred season. Confirm current road access and hotel operations before offering it.`);
  }
  if (dayPlans.some((d) => d.stay === 'Gurez') && !isGurezAllowed(input.arrival)) alerts.push('Gurez is outside the May-October planning window and should not be confirmed.');
  dayPlans.flatMap((d) => d.blocks).filter((b) => b.intelligence?.status === 'CONDITIONAL' || b.intelligence?.status === 'LIVE_CHECK').forEach((b) => alerts.push(`${b.name}: ${b.intelligence?.note || 'Current access/operation check required.'}`));
  const plan: Plan = {
    input: normalized,
    nights,
    days: nights + 1,
    stays: staySegments.map((segment) => ({ name: segment.name, nights: segment.nights, destination: destinationByName(segment.name)! })),
    dayPlans,
    routeKm: m.routeKm,
    driveHours: m.driveHours,
    hotelChanges: Math.max(0, staySegments.length - 1),
    travelLoad: m.travelLoad,
    estimatedTotal: total,
    rangeLow: low,
    rangeHigh: high,
    costs: { accommodation, transport: estimated.transport, meals: 0, activities: 0, contingency: 0 },
    hotelPlans,
    evaluation: {
      budgetFit: normalized.budget === 0 ? 'No budget supplied' : total <= (normalized.budget * (normalized.adults + normalized.youngAges.length)) ? 'Within entered budget' : 'Above entered budget',
      season: seasonForDate(input.arrival),
      capacity: `${staySegments.length} stay segments using destination day and night windows`,
      route: `${Math.round(m.routeKm)} km across ${m.driveHours.toFixed(1)} planning driving hours`,
      dataConfidence: 'Destination content and routing rules are stored in the Chakar intelligence registry; live traffic, road access, room inventory, operator availability and changed supplier rates still require dated provider checks.',
      alerts,
      ruleTrace,
      exclusions,
    },
  };
  return { ...plan, destinationSnapshot: snapshotPlanDestinations(plan) };
}

export function rebuildPlanFromNightSequence(plan: Plan, requestedSequence: string[]): Plan {
  return withPlanDestinations(plan, () => rebuildExistingPlanFromNightSequence(plan, requestedSequence));
}

function rebuildExistingPlanFromNightSequence(plan: Plan, requestedSequence: string[]): Plan {
  if (requestedSequence.length < 1 || requestedSequence.length > 30) throw new Error('Night allocation must contain between 1 and 30 nights.');
  if (requestedSequence.some((name) => !destinationByName(name)?.overnight_allowed)) throw new Error('Every selected overnight destination must allow overnight stays.');
  const nightSequence = departureNightSequence(plan.input, requestedSequence);
  const changedFinalNight = requestedSequence.at(-1) !== nightSequence.at(-1);
  const previousTrips: Record<number, string | null> = {};
  plan.dayPlans.forEach((day, index) => {
    if (index >= nightSequence.length || day.stay !== nightSequence[index] || day.dayTripDestination === undefined) return;
    const newOrigin = index ? nightSequence[index - 1] : (plan.input.pickup.toLowerCase().includes('srinagar') ? 'Srinagar' : plan.input.pickup);
    const visit = day.dayTripDestination;
    if (visit === null || newOrigin === day.from || routeLeg(newOrigin, visit).hours + routeLeg(visit, nightSequence[index]).hours <= 6) {
      previousTrips[day.day] = visit;
    }
  });
  if (changedFinalNight) {
    // Return to Srinagar for the night, preserving the planned excursion. An
    // outlying hotel stay becomes a day visit rather than disappearing.
    const previousFinalDay = plan.dayPlans[nightSequence.length - 1];
    previousTrips[nightSequence.length] = previousFinalDay?.stay === requestedSequence.at(-1) && previousFinalDay.dayTripDestination
      ? previousFinalDay.dayTripDestination : requestedSequence.at(-1)!;
  }
  const nextInput = { ...plan.input, departure: dateAt(plan.input.arrival, nightSequence.length) };
  const dayPlans = buildDays(nextInput, nightSequence, plan.dayPlans[plan.days - 1]?.to || 'Srinagar', previousTrips);
  const previousByDay = new Map(plan.dayPlans.map((d) => [d.day, d]));
  const mergedDays = dayPlans.map((d) => carryDayEdits(previousByDay.get(d.day), d));
  const segments = groupedStays(nightSequence);
  const m = metrics(mergedDays, nightSequence.length);
  const hotelPlans = makeHotelPlans(nightSequence, plan.input.hotelCategory);
  const rebuilt: Plan = {
    ...plan,
    input: nextInput,
    nights: nightSequence.length,
    days: nightSequence.length + 1,
    dayPlans: mergedDays,
    stays: segments.map((segment) => ({ name: segment.name, nights: segment.nights, destination: destinationByName(segment.name)! })),
    hotelPlans,
    hotelChanges: Math.max(0, segments.length - 1),
    routeKm: m.routeKm,
    driveHours: m.driveHours,
    travelLoad: m.travelLoad,
    evaluation: { ...plan.evaluation, capacity: `${segments.length} stay segments using destination day and night windows`, route: `${Math.round(m.routeKm)} km across ${m.driveHours.toFixed(1)} planning driving hours` },
  };
  return { ...rebuilt, destinationSnapshot: snapshotPlanDestinations(rebuilt, true) };
}

function dayContext(day: DayPlan) {
  return JSON.stringify([
    day.date, day.label, day.from, day.to, day.stay, day.dayTripDestination || null,
    day.drive.hours, day.drive.via, day.arrivalTime, day.departureTime,

  ]);
}

function carryDayEdits(previous: DayPlan | undefined, generated: DayPlan): DayPlan {
  if (!previous) return generated;
  if (dayContext(previous) !== dayContext(generated)) return { ...generated, previousCustomAbout: previous.customAbout || previous.previousCustomAbout };
  const customBlocks = previous.blocks.filter((block) => block.kind === 'custom' && !generated.blocks.some((next) => next.name === block.name));
  return { ...generated, blocks: [...generated.blocks, ...customBlocks], customTitle: previous.customTitle, customAbout: previous.customAbout, customAboutContext: previous.customAboutContext, previousCustomAbout: previous.previousCustomAbout };
}

/** Retarget a single day to a new overnight-capable destination and refresh that day's local sightseeing. */
export function retargetDay(plan: Plan, dayNumber: number, destinationName: string): Plan {
  return withPlanDestinations(plan, () => retargetExistingDay(plan, dayNumber, destinationName));
}

function retargetExistingDay(plan: Plan, dayNumber: number, destinationName: string): Plan {
  const target = destinationByName(destinationName);
  if (!target) throw new Error('Destination not found in the library.');
  if (!target.overnight_allowed) throw new Error(`${destinationName} is a sightseeing destination and is not marked as an overnight base.`);
  if (dayNumber < 1 || dayNumber > plan.nights) throw new Error('Only overnight days can change the stay destination.');
  if (dayNumber === plan.nights && destinationName !== 'Srinagar' && requiresSrinagarFinalNight(plan.input)) {
    throw new Error('Departure at or before 2 pm requires the final overnight in Srinagar. You can still choose another destination for a day visit.');
  }

  const overnightNames = plan.dayPlans.slice(0, plan.nights).map((d) => d.stay);
  overnightNames[dayNumber - 1] = destinationName;
  return rebuildPlanFromNightSequence(plan, overnightNames);
}

export function setPlanDayTrip(plan: Plan, dayNumber: number, destinationName: string | null): Plan {
  return withPlanDestinations(plan, () => setExistingPlanDayTrip(plan, dayNumber, destinationName));
}

function setExistingPlanDayTrip(plan: Plan, dayNumber: number, destinationName: string | null): Plan {
  plan = enforceDepartureNight(plan);
  if (dayNumber < 1 || dayNumber > plan.nights) throw new Error('Choose a sightseeing day before departure.');
  const oldDay = plan.dayPlans[dayNumber - 1];
  if (destinationName && !destinationByName(destinationName)) throw new Error('Day-trip destination not found.');
  // A return normally finishes the previous overnight destination's visits.
  // Selecting Srinagar explicitly must instead switch this day to city sights.
  if (destinationName === oldDay.stay && !(oldDay.stay === 'Srinagar' && oldDay.from !== oldDay.stay)) destinationName = null;
  const sequence = plan.dayPlans.slice(0, plan.nights).map((d) => d.stay);
  const trips: Record<number, string | null> = {};
  plan.dayPlans.forEach((day) => { if (day.dayTripDestination !== undefined) trips[day.day] = day.dayTripDestination; });
  trips[dayNumber] = destinationName;
  const days = buildDays(plan.input, sequence, plan.dayPlans[plan.days - 1]?.to || 'Srinagar', trips);
  const merged = days.map((day) => carryDayEdits(plan.dayPlans[day.day - 1], day));
  const m = metrics(merged, plan.nights);
  const updated = { ...plan, dayPlans: merged, routeKm: m.routeKm, driveHours: m.driveHours, travelLoad: m.travelLoad, evaluation: { ...plan.evaluation, route: `${Math.round(m.routeKm)} km across ${m.driveHours.toFixed(1)} planning driving hours` } };
  return { ...updated, destinationSnapshot: snapshotPlanDestinations(updated, true) };
}

export function setPlanDeparturePoint(plan: Plan, departurePoint: string): Plan {
  return withPlanDestinations(plan, () => setExistingPlanDeparturePoint(plan, departurePoint));
}

function setExistingPlanDeparturePoint(plan: Plan, departurePoint: string): Plan {
  plan = enforceDepartureNight(plan);
  if (!destinationByName(departurePoint)?.overnight_allowed && departurePoint !== 'Jammu') throw new Error('Choose a recognized departure base.');
  const sequence = plan.dayPlans.slice(0, plan.nights).map((d) => d.stay);
  const trips: Record<number, string | null> = {};
  plan.dayPlans.forEach((day) => { if (day.dayTripDestination !== undefined) trips[day.day] = day.dayTripDestination; });
  const days = buildDays(plan.input, sequence, departurePoint, trips);
  const merged = days.map((day) => carryDayEdits(plan.dayPlans[day.day - 1], day));
  const m = metrics(merged, plan.nights);
  const updated = { ...plan, dayPlans: merged, routeKm: m.routeKm, driveHours: m.driveHours, travelLoad: m.travelLoad, evaluation: { ...plan.evaluation, route: `${Math.round(m.routeKm)} km across ${m.driveHours.toFixed(1)} planning driving hours` } };
  return { ...updated, destinationSnapshot: snapshotPlanDestinations(updated, true) };
}

function enforceDepartureNight(plan: Plan): Plan {
  return requiresSrinagarFinalNight(plan.input) && plan.dayPlans[plan.nights - 1]?.stay !== 'Srinagar'
    ? rebuildPlanFromNightSequence(plan, plan.dayPlans.slice(0, plan.nights).map((day) => day.stay)) : plan;
}

/** Apply compulsory departure logistics, then re-evaluate the library programme and quote. */
export function reschedulePlan(plan: Plan, quote?: ScheduleQuote): Plan {
  return withPlanDestinations(plan, () => rescheduleExistingPlan(plan, quote));
}

function rescheduleExistingPlan(plan: Plan, quote?: ScheduleQuote): Plan {
  plan = enforceDepartureNight(plan);
  const refreshed = plan.dayPlans.map((day) => ({ ...day, drive: journeyDrive(day.from, day.to, day.dayTripDestination) }));
  const dayPlans = scheduleDayPlans(plan.input, refreshed, quote);
  const totals = metrics(dayPlans, plan.nights);
  const scheduled: Plan = { ...plan, dayPlans, ...totals,
    evaluation: { ...plan.evaluation, route: `${Math.round(totals.routeKm)} km across ${totals.driveHours.toFixed(1)} planning driving hours` } };
  return { ...scheduled, destinationSnapshot: snapshotPlanDestinations(scheduled) };
}

export function itineraryPromptContext(plan: Plan) {
  return plan.dayPlans.map((d) => `Day ${d.day} | ${formatDate(d.date)} | ${d.from} -> ${d.to} | Stay ${d.stay}\n${d.blocks.map((b) => `- ${b.name}: ${b.description}`).join('\n')}`).join('\n\n');
}

export { hotelCategories, mealOptions, transportOptions, interests };
void clamp; void roomsRequired; void cnbChildren; void extraBedsRequired;
