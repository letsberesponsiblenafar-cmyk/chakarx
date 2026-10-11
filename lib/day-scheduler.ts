import { destinationByName, destinations, enabledSightseeing, type Destination, type Sightseeing, type VisitWindow } from '@/lib/data';
import { seasonMatches } from '@/lib/seasons';
import { quotedActivityCost } from '@/lib/activities';
import { isGurezAllowed } from '@/lib/intelligence';
import type { DayBlock, DayPlan, TripInput } from '@/lib/itinerary';

export type ScheduleQuote = { activityCosts: Record<string, number>; activitySelections?: Record<string, boolean> };

// Rule order: route -> real travel window -> quoted experiences -> all selected
// library sights, distributed once across the destination's visit days -> copy.
// Visit durations guide distribution; they must never silently untick a place.
const clockMinutes = (time?: string) => time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
const positiveMinutes = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! >= 0 ? Math.round(value!) : fallback;
const key = (destination: string, name: string) => `${destination}\u001f${name}`;
const sightIdentity = (name: string) => {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/^floating market\b/.test(normalized)) return 'floating market';
  if (/^dal lake(?: (?:and|boulevard|waterfront|lakefront|shore|area))*(?: road)?$/.test(normalized)) return 'dal lake waterfront';
  return normalized;
};

function windowFor(day: DayPlan, input: TripInput) {
  const startOfDay = 8 * 60;
  const endOfDay = 22 * 60;
  let start = startOfDay; let end = endOfDay;
  const departure = day.label === 'Departure day';
  const driveMinutes = Math.ceil(day.drive.hours * 60);
  const serviceMinutes = departure ? 30 : 75 + (day.transfer ? 45 : 0);
  const accessMinutes = positiveMinutes(day.drive.access_minutes, 0);
  const transferMinutes = driveMinutes + serviceMinutes + accessMinutes;
  if (day.day === 1) {
    start = Math.max(start, (clockMinutes(input.arrivalTime) ?? startOfDay) + 90);
    // Late arrivals retain a transfer and check-in, without extra visits.
    if (!day.dayTripDestination) end = Math.max(end, start + transferMinutes);
  }
  if (departure) {
    const flight = clockMinutes(input.departureTime);
    end = flight === null ? start + transferMinutes : Math.min(end, flight - 180);
    start = flight === null ? start : Math.min(start, end - transferMinutes);
  }
  const availableMinutes = Math.max(0, end - start);
  const remainingMinutes = Math.max(0, availableMinutes - driveMinutes - serviceMinutes - accessMinutes);
  const issues: string[] = [];
  if (!day.drive.known) issues.push('Set a road distance and drive time for this route in the destination library.');
  if (day.drive.preference === 'NOT_ALLOWED') issues.push('This route is not permitted by the routing rules; choose another journey.');
  if (start < 0) issues.push('The departure transfer would start the previous night. Move the final overnight closer to the departure point.');
  if ((!departure || clockMinutes(input.departureTime) !== null) && driveMinutes + serviceMinutes + accessMinutes > availableMinutes) {
    issues.push('The transfers and required buffers exceed the available day. Change the route or travel times.');
  }
  if ([day.from, day.stay, day.dayTripDestination].includes('Gurez') && !isGurezAllowed(day.date)) issues.push('Gurez is outside the May–October planning window. Choose another destination.');
  return { startMinutes: start, endMinutes: end, availableMinutes, driveMinutes, serviceMinutes: serviceMinutes + accessMinutes, scheduledMinutes: 0, remainingMinutes, overrunMinutes: 0, issues, advisories: [] as string[] };
}

function visiting(day: DayPlan, name: string) {
  if (day.dayTripDestination) return day.dayTripDestination === name;
  if (day.label === 'Departure day') return day.stay === name;
  // Returning to a Srinagar hotel continues the outlying destination visit;
  // staying in Srinagar does not turn every excursion into city sightseeing.
  if (day.transfer && day.stay === 'Srinagar' && day.from !== day.stay) return day.from === name;
  return day.stay === name;
}
function activityVisiting(day: DayPlan, name: string) {
  // An explicitly quoted base experience can follow an excursion. This never
  // makes the hotel's city eligible for its whole sightseeing programme.
  return visiting(day, name) || day.stay === name || Boolean(day.transfer && day.from === name);
}

function seasonEligible(sight: Sightseeing, destination: Destination, date: string) {
  // An explicit operator availability list is authoritative. The season field
  // is a recommendation default for older records with no availability choice.
  if (destination.enabled_sightseeing !== undefined) return true;
  return seasonMatches(sight.season || destination.season || 'all', date) !== false;
}

function sightCost(sight: Sightseeing, destination: Destination, day: DayPlan) {
  const linked = day.scheduledActivities?.some((activity) => activity.destination === destination.name &&
    (destination.activity_timing?.[activity.name]?.sight_names?.includes(sight.name) || sight.requires_activity === activity.name));
  return linked ? 0 : positiveMinutes(sight.visit_minutes, 60) + positiveMinutes(sight.transfer_minutes, 20);
}

export function dayScheduleContext(day: DayPlan) {
  const programme = new Set([...day.blocks.filter((block) => block.kind !== 'arrival' && (block.sights === undefined || block.sights.length))
    .map((block) => block.destination).filter((name): name is string => Boolean(name)),
    ...(day.scheduledActivities || []).map((activity) => activity.destination)]);
  return JSON.stringify([day.date, day.from, day.to, day.stay, day.dayTripDestination, day.arrivalTime, day.departureTime, day.drive.hours, day.drive.km, day.drive.via || [],
    day.blocks.filter((block) => block.kind !== 'arrival').map((block) => [block.name, block.description, block.destination, block.sights]),
    [...programme].filter((name) => day.primaryVisitFor?.includes(name)).map((name) => [name, destinationByName(name)?.day_note]),
    day.scheduledActivities?.map((activity) => [activity.key, destinationByName(activity.destination)?.activity_copy?.[activity.name]])]);
}

export function scheduleDayPlans(input: TripInput, original: DayPlan[], quote?: ScheduleQuote): DayPlan[] {
  const days: DayPlan[] = original.map((day) => ({ ...day,
    arrivalTime: day.day === 1 ? input.arrivalTime : undefined,
    blocks: day.blocks.filter((block) => block.kind === 'arrival' || block.kind === 'custom').map((block) => ({ ...block })),
    scheduledActivities: [], primaryVisitFor: [], timing: windowFor(day, input),
  }));
  const fixedSlots = new Map<number, { start: number; end: number }[]>();
  const normalStarts = new Map(days.map((day) => [day.day, day.timing!.startMinutes]));
  const earlyGaps = new Map<number, number>();
  function slotFor(day: DayPlan, window: VisitWindow | undefined, minutes: number) {
    if (!window || minutes === 0) return { start: 0, end: 0, available: 0, service: 0, fixed: false };
    const normalStart = normalStarts.get(day.day)!;
    const early = window.end <= normalStart;
    // A dawn visit needs a dedicated local morning, never an afternoon arrival
    // or a transfer that is already reserved for a different destination.
    const localDepartureMorning = day.label === 'Departure day' && Boolean(input.departureTime) && !day.transfer &&
      day.timing!.endMinutes >= window.end + day.timing!.driveMinutes + day.timing!.serviceMinutes;
    if (early && (day.day === 1 || day.transfer || day.dayTripDestination || (day.label === 'Departure day' && !localDepartureMorning))) return null;
    let start = early ? window.start : Math.max(window.start, normalStart + day.timing!.driveMinutes + day.timing!.serviceMinutes);
    const slots = fixedSlots.get(day.day) || [];
    for (const slot of [...slots].sort((a, b) => a.start - b.start)) if (start < slot.end && start + minutes > slot.start) start = slot.end;
    const end = start + minutes;
    if (end > Math.min(window.end, day.timing!.endMinutes)) return null;
    const available = early ? Math.max(0, day.timing!.startMinutes - start) : 0;
    const service = early ? Math.max(0, normalStart - end) - (earlyGaps.get(day.day) || 0) : 0;
    return { start, end, available, service, fixed: true };
  }
  function reserveSlot(day: DayPlan, slot: NonNullable<ReturnType<typeof slotFor>>) {
    if (!slot.fixed) return;
    fixedSlots.set(day.day, [...(fixedSlots.get(day.day) || []), { start: slot.start, end: slot.end }]);
    day.timing!.startMinutes -= slot.available;
    day.timing!.availableMinutes += slot.available;
    day.timing!.serviceMinutes += slot.service;
    day.timing!.remainingMinutes += slot.available - slot.service;
    if (slot.end <= normalStarts.get(day.day)!) earlyGaps.set(day.day, Math.max(0, normalStarts.get(day.day)! - slot.end));
  }

  // Quoted experiences reserve time before optional sightseeing. Longest first
  // keeps a short stop from consuming the only full day available to a trek.
  const quoted = quote ? destinations.flatMap((destination) => destination.activities.flatMap((name) => {
    const activity = { key: key(destination.name, name), destination: destination.name, name, available: (destination.enabled_activities || []).includes(name) };
    const minutes = positiveMinutes(destination.activity_timing?.[name]?.duration_minutes, 60);
    return quotedActivityCost(quote.activityCosts, activity, quote.activitySelections) !== null && days.some((day) => activityVisiting(day, destination.name)) ? [{ ...activity, minutes, window: destination.activity_timing?.[name]?.time_window }] : [];
  })).sort((a, b) => b.minutes - a.minutes || a.key.localeCompare(b.key)) : [];
  for (const activity of quoted) {
    const candidates = days.filter((day) => activityVisiting(day, activity.destination));
    const fit = candidates.filter((day) => {
      const slot = slotFor(day, activity.window, activity.minutes);
      return slot && day.timing!.remainingMinutes + slot.available - slot.service >= activity.minutes &&
        !(day.transfer && day.drive.hours >= 3 && activity.minutes > 90) &&
        !day.timing!.issues.some((issue) => /transfers|road distance|not permitted|Gurez|previous night/.test(issue));
    })
      .sort((a, b) => Number(visiting(b, activity.destination)) - Number(visiting(a, activity.destination)) ||
        (b.timing!.remainingMinutes + (!b.transfer ? 90 : 0)) - (a.timing!.remainingMinutes + (!a.transfer ? 90 : 0)) || a.day - b.day)[0];
    if (!fit) {
      const target = candidates.sort((a, b) => b.timing!.remainingMinutes - a.timing!.remainingMinutes)[0];
      target?.timing!.issues.push(`${activity.destination}: ${activity.name} is included in the quote but cannot fit the journey. Add time, adjust the route, or remove the activity.`);
      continue;
    }
    const slot = slotFor(fit, activity.window, activity.minutes)!;
    reserveSlot(fit, slot);
    fit.scheduledActivities!.push({ key: activity.key, destination: activity.destination, name: activity.name, minutes: activity.minutes });
    fit.timing!.scheduledMinutes += activity.minutes;
    fit.timing!.remainingMinutes -= activity.minutes;
  }

  function updateLoad(day: DayPlan) {
    const timing = day.timing!;
    const load = timing.driveMinutes + timing.serviceMinutes + timing.scheduledMinutes;
    timing.remainingMinutes = Math.max(0, timing.availableMinutes - load);
    timing.overrunMinutes = Math.max(0, load - timing.availableMinutes);
  }
  const usable = (day: DayPlan) => day.timing!.availableMinutes > day.timing!.driveMinutes + day.timing!.serviceMinutes &&
    !day.timing!.issues.some((issue) => /transfers|road distance|not permitted|Gurez|previous night/.test(issue));
  const preference = (day: DayPlan, name: string) => day.dayTripDestination === name ? 5
    : day.label === 'Departure day' ? 1 : day.day === 1 ? 2
    : !day.transfer && day.stay === name ? 4 : 3;
  for (const day of days) {
    day.timing!.scheduledMinutes += day.blocks.filter((block) => block.kind === 'custom').length * 60;
    updateLoad(day);
  }

  // Build the complete selected programme before assigning days. Ownership of
  // overlapping records goes to an explicit destination visit (e.g. a Mughal
  // Gardens excursion), so an earlier Srinagar arrival cannot consume it first.
  type SelectedSight = { destination: Destination; sight: Sightseeing; candidates: DayPlan[] };
  const selected = new Map<string, SelectedSight>();
  for (const destination of destinations) {
    const active = new Set(enabledSightseeing(destination));
    const relevant = days.filter((day) => visiting(day, destination.name));
    if (!relevant.length) continue;
    const normal = relevant.filter((day) => day.label !== 'Departure day' && usable(day));
    const candidates = normal.length ? normal : relevant.filter(usable);
    for (const sight of destination.local_sightseeing.filter((item) => active.has(item.name) && relevant.some((day) => seasonEligible(item, destination, day.date)))) {
      if (!candidates.length) {
        relevant[0].timing!.issues.push(`${destination.name}: the selected programme needs a visit day between arrival and departure. Adjust the route or edit this day's description.`);
        continue;
      }
      // A selected early visit can use a late departure's local morning when
      // every ordinary day is an afternoon arrival or another excursion.
      const windowCandidates = sight.time_window ? relevant.filter((day) => usable(day) &&
        slotFor(day, sight.time_window, sightCost(sight, destination, day)) !== null) : [];
      const entry = { destination, sight, candidates: windowCandidates.length ? windowCandidates : candidates };
      const identity = sightIdentity(sight.name);
      const previous = selected.get(identity);
      if (!previous || Math.max(...entry.candidates.map((day) => preference(day, destination.name))) >
        Math.max(...previous.candidates.map((day) => preference(day, previous.destination.name)))) selected.set(identity, entry);
    }
  }
  const entries = [...selected.values()].sort((a, b) =>
    Number(Boolean(b.sight.time_window)) - Number(Boolean(a.sight.time_window)) ||
    Number(b.sight.arrival_suitable === true) - Number(a.sight.arrival_suitable === true));
  for (const { destination, sight, candidates } of entries) {
    const choices = candidates.map((day) => ({ day, cost: sightCost(sight, destination, day),
      slot: slotFor(day, sight.time_window, sightCost(sight, destination, day)) }));
    const fitsWindow = choices.filter((choice) => choice.slot !== null);
    const pool = fitsWindow.length ? fitsWindow : choices;
    const hasFullVisit = candidates.some((day) => !day.transfer && day.label !== 'Departure day');
    const score = ({ day, cost }: typeof choices[number]) => {
      const timing = day.timing!;
      const capacity = Math.max(30, timing.availableMinutes - timing.driveMinutes - timing.serviceMinutes);
      const arrival = day.transfer && day.stay === destination.name;
      const heavyArrival = arrival && day.drive.hours >= 3;
      // Nearby places belong on a long arrival, with the full valley circuit
      // reserved for the following visit day. The final visit still retains
      // all selected places when there is no second day to share them with.
      const returnTransfer = day.transfer && day.from === destination.name && day.stay !== destination.name;
      const anotherVisit = candidates.some((other) => other !== day && (!other.transfer || other.from === destination.name));
      const arrivalPenalty = ((heavyArrival && anotherVisit) || (returnTransfer && hasFullVisit)) && sight.arrival_suitable !== true ? 10 : 0;
      const arrivalStops = day.blocks.filter((block) => block.kind === 'sightseeing' && block.destination === destination.name).length;
      const arrivalLoad = heavyArrival && anotherVisit && arrivalStops >= 2 ? 20 : 0;
      const shortVisitBonus = hasFullVisit && day.transfer && sight.arrival_suitable === true && arrivalStops === 0 ? -2 : 0;
      const nearbyBonus = arrival && sight.arrival_suitable === true && timing.scheduledMinutes < 100 ? -0.3 : 0;
      const linkedBonus = cost === 0 ? -20 : 0;
      return (timing.scheduledMinutes + cost) / capacity + arrivalPenalty + arrivalLoad + shortVisitBonus + nearbyBonus + linkedBonus;
    };
    const chosen = [...pool].sort((a, b) => score(a) - score(b) || a.day.day - b.day.day)[0];
    const day = chosen.day;
    if (chosen.slot) reserveSlot(day, chosen.slot);
    else day.timing!.advisories!.push(`${sight.name} remains in the programme. Review its visit window or edit the day's wording.`);
    const block: DayBlock = { name: sight.name, startMinute: chosen.slot?.fixed ? chosen.slot.start : undefined,
      description: sight.client_sentence || `Visit ${sight.name}.`, destination: destination.name,
      reason: 'Selected in the destination library and assigned once across this destination’s visit days.', tags: sight.tags,
      kind: 'sightseeing', source: destination.source, intelligence: { status: 'STANDARD', extraCost: false,
        note: `${chosen.cost} estimated minutes including local movement; selection remains editable in the day description.` } };
    day.blocks.push(block);
    day.timing!.scheduledMinutes += chosen.cost;
    updateLoad(day);
  }
  for (const day of days) {
    const timing = day.timing!;
    if (timing.overrunMinutes) timing.advisories!.push('All selected places are included. Review the estimated visit durations or refine the description to match your preferred pace.');
    day.blocks.sort((a, b) => {
      const rank = (block: DayBlock) => block.kind === 'arrival' ? -2 : block.startMinute !== undefined && block.startMinute < normalStarts.get(day.day)! ? -1 : 0;
      return rank(a) - rank(b);
    });
    if (day.dayTripDestination) {
      const sights = day.blocks.filter((block) => block.destination === day.dayTripDestination && block.kind === 'sightseeing');
      day.blocks = [...day.blocks.filter((block) => !sights.includes(block)), {
        name: `${day.dayTripDestination} day trip`, description: `Day visit to ${day.dayTripDestination}.`, destination: day.dayTripDestination,
        reason: 'The visit uses the same timed sightseeing allocation as the client description.',
        sights: sights.map((block) => block.name), tags: ['day-trip'], kind: 'sightseeing', intelligence: { status: 'STANDARD' },
      }];
    }
    const hasVisits = day.blocks.some((block) => block.kind === 'sightseeing' && (!block.name.endsWith('day trip') || Boolean(block.sights?.length))) || Boolean(day.scheduledActivities?.length);
    if (!hasVisits && usable(day) && (day.dayTripDestination || (!day.transfer && day.label !== 'Departure day'))) timing.advisories!.push('The selected places are already assigned to other days. Add a different visit or edit this day’s description.');
    timing.issues = [...new Set(timing.issues)];
    timing.advisories = [...new Set(timing.advisories)];
  }

  const primary = new Map<string, { day: number; score: number }>();
  for (const day of days) for (const destination of destinations) {
    const score = day.blocks.filter((block) => block.destination === destination.name && block.kind === 'sightseeing').reduce((total, block) => total + (block.sights?.length || 1), 0)
      + day.scheduledActivities!.filter((activity) => activity.destination === destination.name).length;
    if (score && score > (primary.get(destination.name)?.score || 0)) primary.set(destination.name, { day: day.day, score });
  }
  return days.map((day, index) => {
    const previous = original[index];
    day.primaryVisitFor = [...primary.entries()].filter(([, entry]) => entry.day === day.day).map(([name]) => name);
    const changed = (previous.customAboutContext || dayScheduleContext(previous)) !== dayScheduleContext(day);
    return { ...day,
      timing: { ...day.timing!, issues: !changed && previous.customAbout?.trim() ? day.timing!.issues.filter((issue) => !issue.includes('the selected programme needs a visit day')) : day.timing!.issues },
      customAbout: changed ? undefined : previous.customAbout,
      customAboutContext: changed ? undefined : previous.customAboutContext,
      previousCustomAbout: changed ? previous.customAbout || previous.previousCustomAbout : previous.previousCustomAbout };
  });
}
