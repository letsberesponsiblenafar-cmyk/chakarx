import { destinationByName, destinations, hotelCategories, interests, mealOptions, routeByName, transportOptions, travelStyles } from '@/lib/data';
import type { Destination, Route, Site, Hotel } from '@/lib/data';
import { firstHotelCandidate, roomsRequired, cnbChildren, extraBedsRequired } from '@/lib/hotels';
import { destinationPriority, recommendationWeight, routeDecision, routeRule, sightseeingRule, isGurezAllowed, shouldPreferOffbeat, templateFor, destinationAccessFlags, engineRules } from '@/lib/intelligence';

export type TripInput = {
  name: string; arrival: string; departure: string; pickup: string; adults: number; youngAges: number[]; budget: number;
  hotelCategory: string; transport: string; mealPlan: string; style: typeof travelStyles[number]; interests: string[];
};
export type RouteLeg = Route & { from: string; to: string; via?: string[]; known: boolean; preference: 'PREFERRED' | 'ALLOWED' | 'AVOID' | 'NOT_ALLOWED'; vehicleDaysCharged: number; rationale: string; preferredAlternative?: string };
export type DayBlock = { name: string; description: string; reason: string; tags: string[]; source?: string; conditional?: boolean; kind?: 'sightseeing' | 'arrival' | 'transfer' | 'departure' | 'custom'; intelligence?: { status: 'STANDARD' | 'OPTIONAL' | 'CONDITIONAL' | 'EXTRA' | 'EXCLUDED' | 'SEASONAL' | 'LIVE_CHECK'; extraCost?: boolean; note?: string } };
export type DayPlan = { day: number; date: string; label: string; from: string; to: string; stay: string; transfer: boolean; drive: RouteLeg; blocks: DayBlock[]; notes: string[]; customTitle?: string; customAbout?: string };
export type Stay = { name: string; nights: number; destination: Destination };
export type HotelCandidate = Hotel;
export type HotelPlan = { location: string; nights: number; candidate: HotelCandidate | null };
export type Plan = {
  input: TripInput; nights: number; days: number; stays: Stay[]; dayPlans: DayPlan[]; routeKm: number; driveHours: number; hotelChanges: number; travelLoad: 'Light' | 'Moderate' | 'Heavy';
  estimatedTotal: number; rangeLow: number; rangeHigh: number; costs: { accommodation: number; transport: number; meals: number; activities: number; contingency: number };
  hotelPlans: HotelPlan[]; evaluation: { budgetFit: string; season: string; capacity: string; route: string; dataConfidence: string; alerts: string[]; ruleTrace: string[]; exclusions: string[] };
};

type PlanningStyle = TripInput['style'];
const transportRates: Record<string, number> = { Sedan: 3400, Ertiga: 4200, Innova: 5200, 'Tempo Traveller': 7600 };

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
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
  const month = monthNumber(date);
  const season = String('season' in d ? d.season : d.months).toLowerCase();
  if (season === 'all') return 1;
  if (season.includes('winter') && [12, 1, 2].includes(month)) return 1;
  if (season.includes('spring') && [3, 4, 5].includes(month)) return 1;
  if (season.includes('summer') && [6, 7, 8].includes(month)) return 1;
  if (season.includes('autumn') && [9, 10, 11].includes(month)) return 1;
  if (season.includes('spring-autumn') && [3, 4, 5, 9, 10, 11].includes(month)) return 0.9;
  return 0.45;
}

function routeLeg(from: string, to: string): RouteLeg {
  const policy = routeDecision(from, to);
  if (from === to) return { from, to, km: 0, hours: 0, source: 'No movement', live_required: false, known: true, preference: 'ALLOWED', vehicleDaysCharged: 0, rationale: policy.rationale };
  const direct = routeByName(from, to);
  if (direct) return { ...direct, from, to, known: true, preference: policy.preference, vehicleDaysCharged: policy.vehicleDays, rationale: policy.rationale, preferredAlternative: policy.preferredAlternative };
  const a = routeByName(from, 'Srinagar'); const b = routeByName('Srinagar', to);
  if (a && b) return { from, to, via: ['Srinagar'], km: a.km + b.km, hours: a.hours + b.hours, source: 'Composed from stored Srinagar legs', live_required: true, known: true, preference: policy.preference, vehicleDaysCharged: policy.vehicleDays, rationale: policy.rationale, preferredAlternative: policy.preferredAlternative };
  return { from, to, km: 0, hours: 0, source: 'Live routing required', live_required: true, known: false, preference: policy.preference, vehicleDaysCharged: policy.vehicleDays, rationale: policy.rationale, preferredAlternative: policy.preferredAlternative };
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

function targetBaseCount(nights: number, style: PlanningStyle) {
  if (nights <= 2) return 1;
  if (nights <= 4) return style === 'Relaxed' ? 2 : 3;
  if (nights <= 6) return 3;
  if (nights <= 9) return style === 'Relaxed' ? 3 : style === 'Packed' ? 5 : 4;
  if (nights <= 12) return style === 'Relaxed' ? 4 : 5;
  if (nights <= 16) return 6;
  if (nights <= 21) return 7;
  return 8;
}

function chooseBases(input: TripInput, nights: number) {
  const srinagar = destinationByName('Srinagar');
  if (!srinagar) throw new Error('Srinagar destination is missing from data.');
  const candidates = destinations
    .filter((d) => d.overnight_allowed && d.base && d.name !== 'Srinagar')
    .filter((d) => seasonFit(d, input.arrival) >= 0.45)
    .map((d) => ({ d, score: scoredDestination(d, input, input.arrival) }))
    .sort((a, b) => b.score - a.score);
  const need = Math.max(1, targetBaseCount(nights, input.style) - 1);
  const chosen: Destination[] = []; let minNights = 1;
  for (const item of candidates) {
    if (chosen.length >= need) break;
    if (minNights + item.d.min_nights > nights) continue;
    chosen.push(item.d); minNights += item.d.min_nights;
  }
  return [srinagar, ...chosen];
}

function allocateNights(bases: Destination[], nights: number, input: TripInput) {
  const selected = bases.slice(); const minMap = new Map<string, number>();
  for (const d of selected) minMap.set(d.name, d.name === 'Srinagar' && nights >= 3 ? 2 : d.min_nights);
  let total = [...minMap.values()].reduce((a, b) => a + b, 0);
  while (total > nights && selected.length > 1) {
    const removable = selected.slice(1).sort((a, b) => scoredDestination(a, input, input.arrival) - scoredDestination(b, input, input.arrival))[0];
    selected.splice(selected.indexOf(removable), 1); total -= minMap.get(removable.name) || 1; minMap.delete(removable.name);
  }
  if (total > nights) { minMap.set('Srinagar', 1); total = 1; selected.splice(1, selected.length - 1); }

  const rankedExtras = destinations
    .filter((d) => d.overnight_allowed && d.base && !selected.some((x) => x.name === d.name))
    .filter((d) => seasonFit(d, input.arrival) >= 0.45)
    .sort((a, b) => scoredDestination(b, input, input.arrival) - scoredDestination(a, input, input.arrival));
  let extraCursor = 0;
  while (total < nights) {
    const extendable = selected.filter((d) => (minMap.get(d.name) || 0) < d.max_nights);
    if (extendable.length) {
      extendable.sort((a, b) => ((b.ideal_nights - (minMap.get(b.name) || 0)) - (a.ideal_nights - (minMap.get(a.name) || 0))) || scoredDestination(b, input, input.arrival) - scoredDestination(a, input, input.arrival));
      const pick = extendable[0]; minMap.set(pick.name, (minMap.get(pick.name) || 0) + 1); total++; continue;
    }
    let added = false;
    while (extraCursor < rankedExtras.length) {
      const candidate = rankedExtras[extraCursor++];
      if (candidate.min_nights <= nights - total) { selected.push(candidate); minMap.set(candidate.name, candidate.min_nights); total += candidate.min_nights; added = true; break; }
    }
    if (!added) break;
  }
  if (total < nights) throw new Error('The destination database does not contain enough productive overnight capacity for this trip length.');
  return selected.map((d) => ({ destination: d, nights: minMap.get(d.name) || 1 }));
}

function orderBases(stays: { destination: Destination; nights: number }[], input: TripInput) {
  const s = stays.find((x) => x.destination.name === 'Srinagar');
  const rest = stays.filter((x) => x.destination.name !== 'Srinagar'); const ordered: typeof rest = []; let current = 'Srinagar';
  while (rest.length) {
    rest.sort((a, b) => {
      const ra = routeLeg(current, a.destination.name), rb = routeLeg(current, b.destination.name);
      const clusterA = a.destination.cluster === destinationByName(current)?.cluster ? 4 : 0;
      const clusterB = b.destination.cluster === destinationByName(current)?.cluster ? 4 : 0;
      const policyA = ra.preference === 'AVOID' ? -18 : ra.preference === 'PREFERRED' ? 5 : 0;
      const policyB = rb.preference === 'AVOID' ? -18 : rb.preference === 'PREFERRED' ? 5 : 0;
      return (scoredDestination(b.destination, input, input.arrival) + clusterB + policyB - rb.hours * 1.8) - (scoredDestination(a.destination, input, input.arrival) + clusterA + policyA - ra.hours * 1.8);
    });
    const next = rest.shift()!; ordered.push(next); current = next.destination.name;
  }
  return s ? [s, ...ordered] : ordered;
}

function siteLimit(style: PlanningStyle, transfer: boolean, isDeparture: boolean) {
  if (isDeparture) return 2;
  if (transfer) return style === 'Packed' ? 3 : 2;
  return style === 'Relaxed' ? 3 : style === 'Packed' ? 5 : 4;
}

function compatibleSites(d: Destination, used: Set<string>, date: string, input: TripInput) {
  const preferred = new Set(input.interests.map((x) => x.toLowerCase()));
  return d.local_sightseeing.filter((s) => !used.has(`${d.name}::${s.name}`) && seasonFit({ ...d, season: s.season || d.season }, date) >= 0.45).sort((a, b) => {
    const aFit = a.tags.filter((x) => preferred.has(x.toLowerCase())).length;
    const bFit = b.tags.filter((x) => preferred.has(x.toLowerCase())).length;
    return (bFit * 5 + seasonFit(d, date) * 2) - (aFit * 5 + seasonFit(d, date) * 2);
  });
}

function siteBlocks(d: Destination, count: number, used: Set<string>, date: string, input: TripInput, kind: DayBlock['kind'] = 'sightseeing') {
  const out: DayBlock[] = [];
  for (const s of compatibleSites(d, used, date, input)) {
    if (out.length >= count) break;
    const rule = sightseeingRule(d.name, s.name);
    const conditional = rule.status === 'CONDITIONAL' || rule.status === 'SEASONAL' || rule.status === 'LIVE_CHECK';
    out.push({
      name: s.name,
      description: s.description,
      reason: rule.notes || `Local sightseeing selected from the ${d.name} destination library for this day.`,
      tags: s.tags,
      source: d.source,
      conditional,
      kind,
      intelligence: { status: rule.status, extraCost: rule.extraCost, note: rule.notes },
    });
    used.add(`${d.name}::${s.name}`);
  }
  return out;
}

function fallbackBlock(stay: string): DayBlock {
  const d = destinationByName(stay);
  return { name: `Explore ${stay} at your own pace`, description: d?.description || 'Free time around the selected destination.', reason: 'The library has fewer unallocated sights for this date, so the plan preserves unstructured time instead of inventing an attraction.', tags: d?.tags || ['relaxation'], kind: 'sightseeing', intelligence: { status: 'STANDARD', note: 'Unstructured time intentionally preserved.' } };
}

function dayTripBlock(base: Destination, target: Destination, date: string, input: TripInput): DayBlock {
  const template = templateFor(target.name, 0, 'Day Trip');
  const firstSites = compatibleSites(target, new Set<string>(), date, input).slice(0, 3);
  const labels = firstSites.map((s) => s.name).join(' · ');
  return {
    name: `${target.name} day trip`,
    description: template?.notes || `${target.name} excursion from ${base.name}.`,
    reason: `Day-trip template selected. Overnight remains ${base.name}; this visit does not change the hotel base or the next day's origin.`,
    tags: [...new Set([...target.tags, 'day-trip'])],
    source: target.source,
    conditional: target.access !== 'standard',
    kind: 'sightseeing',
    intelligence: { status: target.access === 'standard' ? 'STANDARD' : 'CONDITIONAL', note: labels ? `Template highlights: ${labels}.` : 'Verify current access before confirmation.' },
  };
}

function chooseDayTrip(base: Destination, nightSequence: string[], date: string, input: TripInput) {
  if (base.name !== 'Srinagar') return null;
  const candidates = destinations.filter((d) => d.name !== 'Srinagar' && !nightSequence.includes(d.name) && d.base && d.overnight_allowed);
  const allowed = candidates.filter((d) => seasonFit(d, date) >= 0.45 && (d.name !== 'Gurez' || isGurezAllowed(date)));
  return allowed.sort((a, b) => scoredDestination(b, input, date) - scoredDestination(a, input, date))[0] || null;
}

function buildNightSequence(ordered: { destination: Destination; nights: number }[], nights: number) {
  if (nights <= 2) return Array.from({ length: nights }, () => 'Srinagar');
  const seq: string[] = [];
  const push = (name: string, count: number) => { for (let i = 0; i < count && seq.length < nights; i++) seq.push(name); };
  push('Srinagar', 1);
  const rest = ordered.filter((x) => x.destination.name !== 'Srinagar');
  for (const stay of rest) {
    if (seq.length >= nights) break;
    const room = nights - seq.length;
    const stayNights = Math.min(stay.nights, room);
    push(stay.destination.name, stayNights);
    if (seq.length < nights && seq[seq.length - 1] !== 'Srinagar') push('Srinagar', 1);
  }
  while (seq.length < nights) push('Srinagar', 1);
  return seq.slice(0, nights);
}

function arrivalBlock(input: TripInput, stay: string, date: string): DayBlock {
  const pickup = input.pickup?.trim() || 'the selected pick-up point';
  const arrivalPlace = pickup.toLowerCase().includes('other') ? pickup : pickup;
  const routed = arrivalPlace.toLowerCase() !== stay.toLowerCase();
  return {
    name: routed ? `Arrival in ${arrivalPlace} · onward to ${stay}` : `Arrival in ${stay}`,
    description: routed
      ? `The day begins with the client's arrival at ${arrivalPlace}, followed by the planned transfer towards ${stay}. Time is kept flexible for check-in, settling in and local sightseeing around ${stay}.`
      : `The client arrives in ${stay}. After arrival and check-in, the remaining time is reserved for a relaxed introduction to ${stay} and local sightseeing.` ,
    reason: `Arrival flow is derived from the traveller's selected pick-up point (${pickup}) and the first overnight destination (${stay}).`,
    tags: ['arrival', 'local-sightseeing'],
    kind: 'arrival',
    intelligence: { status: 'STANDARD', note: `Arrival point: ${pickup}.` },
    source: 'Chakar itinerary flow',
  };
}

function buildDays(input: TripInput, nightSequence: string[]) {
  const nights = nightSequence.length; const used = new Set<string>(); const days: DayPlan[] = [];
  for (let index = 0; index <= nights; index++) {
    const date = dateAt(input.arrival, index);
    if (index === nights) {
      const stay = nightSequence[nights - 1] || 'Srinagar'; const base = destinationByName(stay)!;
      const blocks = siteBlocks(base, siteLimit(input.style, true, true), used, date, input, 'departure');
      const drive = routeLeg(stay, 'Srinagar');
      days.push({ day: index + 1, date, label: 'Departure day', from: stay, to: 'Srinagar', stay, transfer: true, drive, blocks: blocks.length ? blocks : [fallbackBlock(stay)], notes: ['Keep the final sightseeing window flexible around the departure schedule.', ...(drive.preference === 'AVOID' ? [drive.rationale] : [])] });
      continue;
    }
    const stay = nightSequence[index] || 'Srinagar'; const previous = index === 0 ? (input.pickup.toLowerCase().includes('srinagar') ? 'Srinagar' : input.pickup) : (nightSequence[index - 1] || stay);
    const base = destinationByName(stay)!; const transfer = index === 0 ? true : stay !== previous;
    let drive = routeLeg(previous.toLowerCase().includes('jammu') && !previous.toLowerCase().includes('srinagar') ? 'Srinagar' : previous, stay);
    const arrival = index === 0 ? [arrivalBlock(input, stay, date)] : [];
    const sightseeing = transfer ? siteBlocks(base, siteLimit(input.style, true, false), used, date, input, 'transfer') : siteBlocks(base, siteLimit(input.style, false, false), used, date, input, 'sightseeing');
    const blocks = [...arrival, ...sightseeing];
    if (!transfer) {
      const excursion = chooseDayTrip(base, nightSequence, date, input);
      if (excursion && blocks.length < siteLimit(input.style, false, false)) {
        blocks.unshift(dayTripBlock(base, excursion, date, input));
        const excursionLeg = routeLeg(base.name, excursion.name);
        drive = { ...drive, km: excursionLeg.km * 2, hours: excursionLeg.hours * 2, source: `Day-trip round trip: ${base.name} → ${excursion.name} → ${base.name}`, live_required: excursionLeg.live_required, known: excursionLeg.known, preference: excursionLeg.preference, vehicleDaysCharged: Math.max(1, excursionLeg.vehicleDaysCharged), rationale: `Day trip only. Overnight remains ${base.name}; next-day origin remains ${base.name}. ${excursionLeg.rationale}` };
      }
    }
    const accessFlags = destinationAccessFlags(stay);
    const notes = transfer ? ['Road movement and local sightseeing are combined; verify live road conditions before confirmation.'] : [];
    if (drive.preference === 'AVOID') notes.push(drive.rationale);
    if (accessFlags.includes('LIVE_CHECK')) notes.push(`${stay} requires a live/manual access check before confirmation.`);
    if (stay === 'Gurez' && !isGurezAllowed(date)) notes.push('Gurez is blocked outside the May-October planning window.');
    days.push({
      day: index + 1, date, label: index === 0 ? 'Arrival day' : transfer ? 'Move & explore' : 'Explore',
      from: previous === stay ? stay : previous, to: stay, stay, transfer, drive,
      blocks: blocks.length ? blocks : [fallbackBlock(stay)], notes,
    });
  }
  return days;
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
  if (!Number.isFinite(new Date(`${input.arrival}T12:00:00`).getTime()) || !Number.isFinite(new Date(`${input.departure}T12:00:00`).getTime())) throw new Error('Please provide valid travel dates.');
  const nights = tripNights(input);
  if (nights < 1) throw new Error('Departure date must be after arrival date.');
  if (nights > 30) throw new Error('Chakar Experience currently supports trips up to 30 nights.');
  if (!Number.isFinite(input.adults) || input.adults < 1) throw new Error('At least one adult traveler is required.');
  if (!Array.isArray(input.youngAges)) throw new Error('Child ages must be supplied as a list.');
  if (input.youngAges.some((age) => !Number.isFinite(age) || age < 0 || age > 99)) throw new Error('Child ages must be valid non-negative ages.');
  if (!Array.isArray(input.interests)) throw new Error('Interests must be supplied as a list.');
  if (!travelStyles.includes(input.style)) throw new Error('Invalid itinerary configuration.');
  if (!hotelCategories.includes(input.hotelCategory)) throw new Error('Invalid itinerary category.');
  if (!transportOptions.includes(input.transport)) throw new Error('Invalid transport option.');
  if (!mealOptions.includes(input.mealPlan)) throw new Error('Invalid meal plan.');
  if (!Number.isFinite(input.budget) || input.budget < 0) throw new Error('Budget must be a valid non-negative amount.');
}

export function createPlan(input: TripInput): Plan {
  validateInput(input);
  const nights = tripNights(input);
  const normalizedMix = normalizeChildrenAndAdults(input.adults, input.youngAges);
  const normalized = { ...input, youngAges: normalizedMix.children, adults: normalizedMix.adults, budget: Math.max(0, input.budget) };
  const chosen = chooseBases(normalized, nights); const allocated = allocateNights(chosen, nights, normalized); const ordered = orderBases(allocated, normalized);
  const nightSequence = buildNightSequence(ordered, nights);
  const dayPlans = buildDays(normalized, nightSequence);
  const staySegments = groupedStays(nightSequence);
  const hotelPlans = makeHotelPlans(nightSequence, normalized.hotelCategory);
  const m = metrics(dayPlans, nights);
  const rooms = roomsRequired(normalized.adults); const people = normalized.adults + normalized.youngAges.length;
  const extraBeds = extraBedsRequired(normalized.youngAges); const cnb = cnbChildren(normalized.youngAges);
  const accommodation = hotelPlans.reduce((sum, h) => sum + h.nights * (h.candidate?.mapB2B ?? 0) * rooms + h.nights * (h.candidate?.extraBedB2B ?? 0) * extraBeds + h.nights * (h.candidate?.cnbB2B ?? 0) * cnb, 0);
  const transport = (transportRates[normalized.transport] ?? transportRates.Ertiga) * Math.max(1, dayPlans.reduce((sum, day) => sum + Math.max(0, day.drive.vehicleDaysCharged), 0));
  const mealPerPerson = normalized.mealPlan === 'None' ? 0 : normalized.mealPlan === 'Breakfast Only' ? 450 : 780;
  const meals = people * nights * mealPerPerson;
  // Optional/extra experiences are deliberately excluded from the base package.
  // Customer-facing activity pricing belongs in the explicit costing layer, not the sightseeing text.
  const activities = 0;
  const contingency = (accommodation + transport + meals + activities) * 0.07;
  const total = accommodation + transport + meals + activities + contingency;
  const low = total * 0.92; const high = total * 1.22;
  const missingRateHotels = hotelPlans.filter((h) => !h.candidate?.mapB2B).map((h) => h.location);
  const alerts: string[] = [];
  const ruleTrace = engineRules().map((x) => x.rule);
  const exclusions = ['Pony rides', 'ATV rides', 'Seasonal snow activities', 'Union/local cabs', 'Personal expenses', 'Gondola tickets'];
  if (missingRateHotels.length) alerts.push(`B2B MAP rates are missing for: ${missingRateHotels.join(', ')}. Verify rates before confirmation.`);
  const budgetTotal = normalized.budget * (normalized.adults + normalized.youngAges.length);
  if (budgetTotal > 0 && total > budgetTotal) alerts.push(`Planning baseline is above the entered per-person budget by about ₹${Math.round(total - budgetTotal).toLocaleString('en-IN')} for the group.`);
  if (m.travelLoad === 'Heavy') alerts.push('The route contains a high movement burden; live routing and road conditions should be checked before confirmation.');
  if (['winter', 'spring'].includes(seasonForDate(input.arrival))) alerts.push('Some mountain activities and access points are seasonal; perform a date-specific operating check.');
  if (dayPlans.some((d) => d.stay === 'Gurez') && !isGurezAllowed(input.arrival)) alerts.push('Gurez is outside the May-October planning window and should not be confirmed.');
  dayPlans.flatMap((d) => d.blocks).filter((b) => b.intelligence?.status === 'CONDITIONAL' || b.intelligence?.status === 'LIVE_CHECK').forEach((b) => alerts.push(`${b.name}: ${b.intelligence?.note || 'Current access/operation check required.'}`));
  return {
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
    costs: { accommodation, transport, meals, activities, contingency },
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
}

export function rebuildPlanFromNightSequence(plan: Plan, nightSequence: string[]): Plan {
  if (nightSequence.length < 1 || nightSequence.length > 30) throw new Error('Night allocation must contain between 1 and 30 nights.');
  if (nightSequence.some((name) => !destinationByName(name)?.overnight_allowed)) throw new Error('Every selected overnight destination must allow overnight stays.');
  const dayPlans = buildDays(plan.input, nightSequence);
  const previousByDay = new Map(plan.dayPlans.map((d) => [d.day, d]));
  const mergedDays = dayPlans.map((d) => {
    const previous = previousByDay.get(d.day);
    return previous ? { ...d, customTitle: previous.stay === d.stay ? previous.customTitle : undefined, customAbout: previous.stay === d.stay ? previous.customAbout : undefined } : d;
  });
  const segments = groupedStays(nightSequence);
  const m = metrics(mergedDays, nightSequence.length);
  const hotelPlans = makeHotelPlans(nightSequence, plan.input.hotelCategory);
  return {
    ...plan,
    nights: nightSequence.length,
    days: nightSequence.length + 1,
    dayPlans: mergedDays,
    stays: segments.map((segment) => ({ name: segment.name, nights: segment.nights, destination: destinationByName(segment.name)! })),
    hotelPlans,
    hotelChanges: Math.max(0, segments.length - 1),
    routeKm: m.routeKm,
    driveHours: m.driveHours,
    travelLoad: m.travelLoad,
  };
}

/** Retarget a single day to a new overnight-capable destination and refresh that day's local sightseeing. */
export function retargetDay(plan: Plan, dayNumber: number, destinationName: string): Plan {
  const target = destinationByName(destinationName);
  if (!target) throw new Error('Destination not found in the library.');
  if (!target.overnight_allowed) throw new Error(`${destinationName} is a sightseeing destination and is not marked as an overnight base.`);
  if (dayNumber < 1 || dayNumber > plan.nights) throw new Error('Only overnight days can change the stay destination.');

  const input = plan.input;
  const overnightNames = plan.dayPlans.slice(0, plan.nights).map((d) => d.stay);
  overnightNames[dayNumber - 1] = destinationName;
  const used = new Set<string>();
  const dayPlans: DayPlan[] = [];

  for (let index = 0; index <= plan.nights; index++) {
    const date = dateAt(input.arrival, index);
    if (index === plan.nights) {
      const stay = overnightNames[overnightNames.length - 1] || 'Srinagar';
      const base = destinationByName(stay)!;
      const blocks = index === dayNumber - 1 ? siteBlocks(base, siteLimit(input.style, true, true), used, date, input, 'departure') : plan.dayPlans[index].blocks;
      dayPlans.push({ ...plan.dayPlans[index], date, from: stay, to: 'Srinagar', stay, transfer: true, drive: routeLeg(stay, 'Srinagar'), blocks: blocks.length ? blocks : [fallbackBlock(stay)] });
      continue;
    }
    const stay = overnightNames[index] || 'Srinagar';
    const previous = index === 0 ? input.pickup : (overnightNames[index - 1] || stay);
    const transfer = index === 0 ? true : stay !== previous;
    const isChanged = index === dayNumber - 1;
    const base = destinationByName(stay)!;
    const blocks = isChanged ? siteBlocks(base, siteLimit(input.style, transfer, false), used, date, input, transfer ? 'transfer' : 'sightseeing') : plan.dayPlans[index].blocks;
    dayPlans.push({
      ...plan.dayPlans[index], date, label: index === 0 ? 'Arrival day' : transfer ? 'Move & explore' : 'Explore',
      from: previous.toLowerCase().includes('jammu') && !previous.toLowerCase().includes('srinagar') ? 'Srinagar' : previous, to: stay, stay, transfer, drive: routeLeg(previous === 'Jammu' ? 'Srinagar' : previous, stay), blocks: blocks.length ? blocks : [fallbackBlock(stay)],
    });
  }
  const segments = groupedStays(overnightNames); const m = metrics(dayPlans, plan.nights); const hotelPlans = makeHotelPlans(overnightNames, input.hotelCategory);
  return { ...plan, dayPlans, stays: segments.map((segment) => ({ name: segment.name, nights: segment.nights, destination: destinationByName(segment.name)! })), hotelChanges: Math.max(0, segments.length - 1), routeKm: m.routeKm, driveHours: m.driveHours, travelLoad: m.travelLoad, hotelPlans, evaluation: { ...plan.evaluation, capacity: `${segments.length} stay segments using destination day and night windows`, route: `${Math.round(m.routeKm)} km across ${m.driveHours.toFixed(1)} planning driving hours` } };
}

export function itineraryPromptContext(plan: Plan) {
  return plan.dayPlans.map((d) => `Day ${d.day} | ${formatDate(d.date)} | ${d.from} -> ${d.to} | Stay ${d.stay}\n${d.blocks.map((b) => `- ${b.name}: ${b.description}`).join('\n')}`).join('\n\n');
}

export { hotelCategories, mealOptions, transportOptions, interests };
void clamp; void roomsRequired; void cnbChildren; void extraBedsRequired;
