import { destinationByName, destinations, enabledSightseeing, type Destination, type Sightseeing, type VisitWindow } from '@/lib/data';
import { quotedActivityCost } from '@/lib/activities';
import { isGurezAllowed } from '@/lib/intelligence';
import { journeyDrive } from '@/lib/journey-drive';
import type { DayBlock, DayPlan, TripInput } from '@/lib/itinerary';

export type ScheduleQuote = { activityCosts: Record<string, number>; activitySelections?: Record<string, boolean> };

// Library checkboxes decide inclusion; the displayed library order decides the
// sequence. Timing guides where consecutive portions fit, never a reshuffle.
const clockMinutes = (time?: string) => time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
const positiveMinutes = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! >= 0 ? Math.round(value!) : fallback;
const key = (destination: string, name: string) => `${destination}\u001f${name}`;
const genericSightWords = new Set([
  'a', 'and', 'area', 'areas', 'alpine', 'bird', 'birdlife', 'blossom', 'camping', 'circuit', 'country', 'countryside',
  'forest', 'forests', 'garden', 'gardens', 'heritage', 'high', 'hill', 'hills', 'lake', 'landscape', 'landscapes',
  'local', 'market', 'markets', 'meadow', 'meadows', 'mountain', 'mountains', 'nature', 'nearby', 'orchard', 'orchards',
  'panorama', 'photography', 'picnic', 'ridge', 'river', 'riverfront', 'riverside', 'road', 'scenery', 'scenic',
  'seasonal', 'shepherd', 'shore', 'shoreline', 'short', 'snow', 'spring', 'stream', 'streams', 'sunrise', 'sunset',
  'surroundings', 'temple', 'the', 'town', 'trail', 'trails', 'trek', 'valley', 'view', 'viewpoint', 'viewpoints',
  'views', 'village', 'villages', 'walk', 'walks', 'watching', 'waterfront',
]);
const sightIdentity = (name: string, destination?: string) => {
  const normalized = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (/^floating market\b/.test(normalized)) return 'floating market';
  if (/^dal lake(?: (?:and|boulevard|waterfront|lakefront|shore|area))*(?: road)?$/.test(normalized)) return 'dal lake waterfront';
  if (/^aru (?:valley|meadows?)$/.test(normalized)) return 'aru valley meadow';
  if (/^betaab valley(?: meadows?)?$/.test(normalized)) return 'betaab valley meadow';
  if (/^chandanwari(?: valley)?$/.test(normalized)) return 'chandanwari valley';
  if (/^peer ki gali(?: pass)?$/.test(normalized)) return 'peer ki gali pass';
  // Generic labels identify different physical places in different valleys.
  // Named landmarks still share an identity across overlapping guide records.
  if (destination && normalized.split(' ').every((word) => genericSightWords.has(word))) return `${destination.toLowerCase()}\u001f${normalized}`;
  return normalized;
};

const missingRoadTime = 'Set a road distance and drive time for this route in the destination library.';
const isPickupDay = (day: DayPlan, input: TripInput) => day.day === 1 && day.label === 'Arrival day' &&
  day.from.trim().toLowerCase() === input.pickup.trim().toLowerCase();

export function pickupTimingNotice(day: DayPlan, input: TripInput) {
  if (!isPickupDay(day, input) || day.drive.known || ['jammu', 'srinagar'].includes(day.from.trim().toLowerCase())) return null;
  return `Custom pickup: ${input.pickup}. Confirm the transfer distance and travel time with your driver. This flag does not block the PDF.`;
}

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
    const arrival = clockMinutes(input.arrivalTime);
    start = arrival === null ? startOfDay : Math.max(startOfDay, arrival + 90);
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
  const pickupNotice = pickupTimingNotice(day, input);
  const advisories: string[] = pickupNotice ? [pickupNotice] : [];
  if (!day.drive.known && !pickupNotice) issues.push(missingRoadTime);
  if (isPickupDay(day, input) && day.from === 'Jammu') advisories.push('Jammu pickup uses a 7-hour NH-44 road-transfer estimate. Confirm current road conditions and pickup time.');
  if (day.day === 1 && end > 24 * 60) advisories.push('The arrival transfer may finish after midnight. Confirm pickup time and late hotel check-in.');
  if (day.drive.preference === 'NOT_ALLOWED') issues.push('This route is not permitted by the routing rules; choose another journey.');
  if (start < 0) issues.push('The departure transfer would start the previous night. Move the final overnight closer to the departure point.');
  if ((!departure || clockMinutes(input.departureTime) !== null) && driveMinutes + serviceMinutes + accessMinutes > availableMinutes) {
    issues.push('The transfers and required buffers exceed the available day. Change the route or travel times.');
  }
  if ([day.from, day.stay, day.dayTripDestination].includes('Gurez') && !isGurezAllowed(day.date)) issues.push('Gurez is outside the May–October planning window. Choose another destination.');
  return { startMinutes: start, endMinutes: end, availableMinutes, driveMinutes, serviceMinutes: serviceMinutes + accessMinutes, scheduledMinutes: 0, remainingMinutes, overrunMinutes: 0, issues, advisories };
}

/** Repair only obsolete pickup diagnostics on saved quotes; never rebuild their
 * sightseeing, authored descriptions, dates, hotel agreements or costs. */
export function dayTimingForReview(day: DayPlan, input: TripInput) {
  if (!day.timing || day.drive.known || !isPickupDay(day, input)) return day.timing;
  const drive = day.from === 'Jammu' ? journeyDrive(day.from, day.to, day.dayTripDestination) : day.drive;
  const retainedIssues = day.timing.issues.filter((issue) => issue !== missingRoadTime);
  if (drive.known) {
    const timing = windowFor({ ...day, drive }, input);
    const load = timing.driveMinutes + timing.serviceMinutes + day.timing.scheduledMinutes;
    return { ...timing, scheduledMinutes: day.timing.scheduledMinutes,
      remainingMinutes: Math.max(0, timing.availableMinutes - load), overrunMinutes: Math.max(0, load - timing.availableMinutes),
      issues: [...new Set([...retainedIssues, ...timing.issues])],
      advisories: [...new Set([...(day.timing.advisories || []), ...timing.advisories,
        ...(load > timing.availableMinutes ? ['Review the saved arrival programme against the pickup transfer time. The saved itinerary is unchanged.'] : [])])] };
  }
  const notice = pickupTimingNotice(day, input);
  return notice ? { ...day.timing, issues: retainedIssues, advisories: [...new Set([...(day.timing.advisories || []), notice])] } : day.timing;
}

function visiting(day: DayPlan, name: string) {
  if (day.dayTripDestination) return day.dayTripDestination === name;
  if (day.label === 'Departure day') return day.stay === name;
  // Returning to a Srinagar hotel continues the outlying destination visit;
  // staying in Srinagar does not turn every excursion into city sightseeing.
  if (day.day > 1 && day.transfer && day.stay === 'Srinagar' && day.from !== day.stay) return day.from === name;
  return day.stay === name;
}
function activityVisiting(day: DayPlan, name: string) {
  // An explicitly quoted base experience can follow an excursion. This never
  // makes the hotel's city eligible for its whole sightseeing programme.
  return visiting(day, name) || day.stay === name || Boolean(day.transfer && day.from === name);
}

function sightCost(sight: Sightseeing, destination: Destination, day: DayPlan) {
  const linked = day.scheduledActivities?.some((activity) => activity.destination === destination.name &&
    (destination.activity_timing?.[activity.name]?.sight_names?.includes(sight.name) || sight.requires_activity === activity.name));
  return linked ? 0 : positiveMinutes(sight.visit_minutes, 60) + positiveMinutes(sight.transfer_minutes, 20);
}

export function dayScheduleContext(day: DayPlan, includeLibrarySights = true, includeLibraryOrder = true) {
  const sources = day.blocks.flatMap((block) => block.librarySights || []);
  const order = new Map(destinations.flatMap((destination) => destination.local_sightseeing
    .filter((sight) => sources.some((source) => source.destination === destination.name && source.name === sight.name))
    .map((sight, index) => [key(destination.name, sight.name), index] as const)));
  const programme = new Set([...day.blocks.filter((block) => block.kind !== 'arrival' && (block.sights === undefined || block.sights.length))
    .map((block) => block.destination).filter((name): name is string => Boolean(name)),
    ...(day.scheduledActivities || []).map((activity) => activity.destination)]);
  return JSON.stringify([day.date, day.from, day.to, day.stay, day.dayTripDestination, day.additionalVisitDestinations || [], day.arrivalTime, day.departureTime, day.drive.hours, day.drive.km, day.drive.via || [],
    day.blocks.filter((block) => block.kind !== 'arrival').map((block) => [block.name, block.description, block.destination, block.sights,
      // Day-trip wrappers and merged aliases track their source lines too;
      // their generic summary alone cannot detect a library sentence edit.
      ...(includeLibrarySights && block.librarySights?.length && (block.sights !== undefined ||
        block.librarySights.some((selection) => selection.destination !== block.destination || selection.name !== selection.visitName))
        ? [block.librarySights.map((selection) => [selection.destination, selection.name, selection.visitName,
          destinationByName(selection.destination)?.local_sightseeing.find((sight) => sight.name === selection.name)?.client_sentence,
          destinationByName(selection.destination)?.local_sightseeing.find((sight) => sight.name === selection.name)?.description,
          ...(includeLibraryOrder ? [order.get(key(selection.destination, selection.name))] : [])])]
        : [])]),
    [...programme].filter((name) => day.primaryVisitFor?.includes(name)).map((name) => {
      const guide = destinationByName(name);
      // Keep old context bytes stable until an operator actually changes mode.
      return [name, guide?.day_note, ...(guide?.day_note_mode ? [guide.day_note_mode] : [])];
    }),
    day.scheduledActivities?.map((activity) => [activity.key, destinationByName(activity.destination)?.activity_copy?.[activity.name]])]);
}

export function scheduleDayPlans(input: TripInput, original: DayPlan[], quote?: ScheduleQuote): DayPlan[] {
  const days: DayPlan[] = original.map((day) => ({ ...day,
    arrivalTime: day.day === 1 ? input.arrivalTime : undefined,
    blocks: day.blocks.filter((block) => block.kind === 'arrival' || block.kind === 'custom').map((block) => ({ ...block })),
    scheduledActivities: [], primaryVisitFor: [], additionalVisitDestinations: [], timing: windowFor(day, input),
  }));
  const fixedSlots = new Map<number, { start: number; end: number }[]>();
  const normalStarts = new Map(days.map((day) => [day.day, day.timing!.startMinutes]));
  const earlyGaps = new Map<number, number>();
  function slotFor(day: DayPlan, window: VisitWindow | undefined, minutes: number, notBefore?: number) {
    if (!window || minutes === 0) return { start: 0, end: 0, available: 0, service: 0, fixed: false };
    const normalStart = normalStarts.get(day.day)!;
    const early = window.end <= normalStart;
    // A dawn visit needs a dedicated local morning, never an afternoon arrival
    // or a transfer that is already reserved for a different destination.
    const localDepartureMorning = day.label === 'Departure day' && Boolean(input.departureTime) && !day.transfer &&
      day.timing!.endMinutes >= window.end + day.timing!.driveMinutes + day.timing!.serviceMinutes;
    if (early && (day.day === 1 || day.transfer || day.dayTripDestination || (day.label === 'Departure day' && !localDepartureMorning))) return null;
    let start = early ? window.start : Math.max(window.start, normalStart + day.timing!.driveMinutes + day.timing!.serviceMinutes);
    if (notBefore !== undefined) start = Math.max(start, notBefore);
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

  // Group duplicate physical visits on one day, preserving every checked
  // record's authored instructions, including records in overlapping guides.
  type SelectedSight = { destination: Destination; sight: Sightseeing; candidates: DayPlan[];
    selections: { destination: string; name: string }[] };
  const selected = new Map<string, SelectedSight>();
  for (const destination of destinations) {
    const active = new Set(enabledSightseeing(destination));
    let relevant = days.filter((day) => visiting(day, destination.name));
    if (destination.name === 'Srinagar' && !relevant.some((day) => day.label !== 'Departure day' && usable(day))) {
      // Older/manual routes may use Srinagar only for hotel nights. Keep its
      // selected city circuit together on one best return day, never spread it
      // across every excursion merely because the hotel base is Srinagar.
      const returnDay = days.filter((day) => day.stay === 'Srinagar' && day.label !== 'Departure day')
        .sort((a, b) => Number(usable(b)) - Number(usable(a)) || Number(Boolean(a.dayTripDestination)) - Number(Boolean(b.dayTripDestination)) ||
          (b.timing!.availableMinutes - b.timing!.driveMinutes - b.timing!.serviceMinutes) -
          (a.timing!.availableMinutes - a.timing!.driveMinutes - a.timing!.serviceMinutes) || a.day - b.day)[0];
      if (returnDay && !relevant.includes(returnDay)) {
        relevant = [...relevant, returnDay];
        returnDay.additionalVisitDestinations = ['Srinagar'];
      }
    }
    if (!relevant.length) continue;
    const normal = relevant.filter((day) => day.label !== 'Departure day' && usable(day));
    const preferredDays = normal.length ? normal : relevant.filter(usable);
    const visitDays = relevant.filter((day) => day.label !== 'Departure day');
    // A known late departure can share the city's remaining visits. Airport
    // reporting and the transfer are already deducted by windowFor; an early
    // or unknown departure must never acquire an invented sightseeing window.
    const departureVisits = relevant.filter((day) => day.label === 'Departure day' && usable(day) &&
      day.timing!.remainingMinutes >= 90);
    const candidates = preferredDays.length ? [...new Set([...preferredDays, ...departureVisits])]
      : visitDays.length ? visitDays : relevant;
    // Use exactly the library's tick state, including its legacy-record fallback.
    // Seasonal metadata guides recommendations; it must not silently remove an
    // operator-selected place from an existing journey and its client wording.
    for (const sight of destination.local_sightseeing.filter((item) => active.has(item.name))) {
      // A selected early visit can use a late departure's local morning when
      // every ordinary day is an afternoon arrival or another excursion.
      const windowCandidates = sight.time_window ? relevant.filter((day) => usable(day) &&
        slotFor(day, sight.time_window, sightCost(sight, destination, day)) !== null) : [];
      const entry: SelectedSight = { destination, sight, candidates: [...new Set([...candidates, ...windowCandidates])],
        selections: [{ destination: destination.name, name: sight.name }] };
      const identity = sightIdentity(sight.name, destination.name);
      const previous = selected.get(identity);
      if (!previous) selected.set(identity, entry);
      else {
        const selections = [...previous.selections, ...entry.selections];
        if (Math.max(...entry.candidates.map((day) => preference(day, destination.name))) >
          Math.max(...previous.candidates.map((day) => preference(day, previous.destination.name)))) selected.set(identity, { ...entry, selections });
        else previous.selections = selections;
      }
    }
  }
  function placementPenalty({ destination, sight, candidates }: SelectedSight, day: DayPlan, cost: number, load: number, first: boolean) {
    const hasFullVisit = candidates.some((day) => !day.transfer && day.label !== 'Departure day');
    const arrival = day.transfer && day.stay === destination.name;
    const heavyArrival = arrival && day.drive.hours >= 5;
    const returnTransfer = day.transfer && day.from === destination.name && day.stay !== destination.name;
    const anotherVisit = candidates.some((other) => {
      if (other === day) return false;
      if (!other.transfer && other.label !== 'Departure day') return true;
      if (other.from !== destination.name) return false;
      const mixedProgramme = other.blocks.some((block) => block.kind === 'sightseeing' && block.destination && block.destination !== destination.name) ||
        other.scheduledActivities!.some((activity) => activity.destination !== destination.name);
      // A return already carrying another programme is not automatically spare.
      const spare = other.timing!.availableMinutes - other.timing!.driveMinutes - other.timing!.serviceMinutes - other.timing!.scheduledMinutes;
      return !mixedProgramme || spare >= sightCost(sight, destination, other);
    });
    // These preferences choose between order-preserving partitions only.
    const arrivalPenalty = sight.arrival_suitable === true ? 0
      : heavyArrival && anotherVisit ? 1.5
      : ((arrival && day.drive.hours >= 3 && anotherVisit) || (returnTransfer && hasFullVisit)) ? 0.15 : 0;
    const shortVisitBonus = hasFullVisit && day.transfer && sight.arrival_suitable === true && first ? -0.35 : 0;
    const nearbyBonus = arrival && sight.arrival_suitable === true && load < 100 ? -0.15 : 0;
    const linkedBonus = cost === 0 ? -20 : 0;
    const departurePenalty = day.label === 'Departure day' ? 0.4 : 0;
    return (arrivalPenalty + shortVisitBonus + nearbyBonus + linkedBonus + departurePenalty) * Math.max(60, cost);
  }

  function orderedAssignments(entries: SelectedSight[]) {
    const destination = entries[0].destination;
    const ranks = new Map(destination.local_sightseeing.map((sight, index) => [sight.name, index]));
    const range = (entry: SelectedSight) => entry.selections.filter((selection) => selection.destination === destination.name)
      .map((selection) => ranks.get(selection.name)!).filter((rank) => rank !== undefined);
    const ordered = [...entries].sort((a, b) => Math.min(...range(a)) - Math.min(...range(b)));
    // Interleaved aliases describe one physical visit. Keep their intervening
    // places on that same day so every source sentence can retain its order.
    const units: { entries: SelectedSight[]; end: number }[] = [];
    for (const entry of ordered) {
      const positions = range(entry);
      const previous = units.at(-1);
      if (previous && Math.min(...positions) <= previous.end) {
        previous.entries.push(entry); previous.end = Math.max(previous.end, ...positions);
      } else units.push({ entries: [entry], end: Math.max(...positions) });
    }
    const visitDays = [...new Set(entries.flatMap((entry) => entry.candidates))].sort((a, b) => a.day - b.day);
    let best = Array<number>(units.length + 1).fill(Infinity); best[0] = 0;
    const boundaries: number[][] = [];
    // Choose partition boundaries, not individual stops. The quadratic load
    // cost balances consecutive groups while preserving chronological order.
    for (const day of visitDays) {
      const next = [...best];
      const cuts = best.map((_, index) => index);
      const timing = day.timing!;
      const capacity = Math.max(30, timing.availableMinutes - timing.driveMinutes - timing.serviceMinutes);
      for (let start = 0; start < units.length; start++) {
        if (!Number.isFinite(best[start])) continue;
        let minutes = 0; let penalties = 0; let extraWindow = 0; let cursor: number | undefined;
        for (let end = start; end < units.length; end++) {
          if (units[end].entries.some((entry) => !entry.candidates.includes(day))) break;
          for (const entry of units[end].entries) {
            const cost = sightCost(entry.sight, destination, day);
            const slot = slotFor(day, entry.sight.time_window, cost, cursor);
            penalties += placementPenalty(entry, day, cost, timing.scheduledMinutes + minutes, end === start);
            if (!slot) penalties += 10000;
            extraWindow = Math.max(extraWindow, slot ? slot.available - slot.service : 0);
            const visitStart = slot?.fixed ? slot.start : Math.max(cursor || 0, normalStarts.get(day.day)! + timing.driveMinutes + timing.serviceMinutes);
            cursor = visitStart + cost;
            minutes += cost;
          }
          // Never overrun airport reporting when an ordinary visit day exists.
          if (day.label === 'Departure day' && minutes > timing.remainingMinutes + extraWindow &&
            entries.some((entry) => entry.candidates.some((other) => other.label !== 'Departure day'))) break;
          const load = timing.scheduledMinutes;
          const score = best[start] + ((load + minutes) ** 2 - load ** 2) / (capacity + extraWindow) + penalties;
          if (score < next[end + 1] - 1e-8) { next[end + 1] = score; cuts[end + 1] = start; }
        }
      }
      boundaries.push(cuts); best = next;
    }
    if (!Number.isFinite(best[units.length])) {
      const fallback = visitDays.find((day) => entries.every((entry) => entry.candidates.includes(day)));
      fallback?.timing!.advisories!.push('The selected library order needs a visit-time review. All checked places remain included.');
      return ordered.map((entry) => ({ entry, day: fallback || entry.candidates[0] }));
    }
    const assigned = new Map<SelectedSight, DayPlan>();
    let count = units.length;
    for (let index = visitDays.length - 1; index >= 0; index--) {
      const start = boundaries[index][count];
      for (let unit = start; unit < count; unit++) for (const entry of units[unit].entries) assigned.set(entry, visitDays[index]);
      count = start;
    }
    return ordered.map((entry) => ({ entry, day: assigned.get(entry)! }));
  }

  const lastVisitEnd = new Map<number, number>();
  for (const destination of destinations) {
    const entries = [...selected.values()].filter((entry) => entry.destination.name === destination.name);
    if (!entries.length) continue;
    for (const { entry, day } of orderedAssignments(entries)) {
      const { sight, selections } = entry;
      const cost = sightCost(sight, destination, day);
      const slot = slotFor(day, sight.time_window, cost, lastVisitEnd.get(day.day));
      if (!usable(day)) day.timing!.advisories!.push('Checked sightseeing remains included. Review the journey and visit-time estimates for this day.');
      if (slot) reserveSlot(day, slot);
      else day.timing!.advisories!.push(`${sight.name} remains in library order. Review its visit window or edit the day's wording.`);
      const visitStart = slot?.fixed ? slot.start : Math.max(lastVisitEnd.get(day.day) || 0,
        normalStarts.get(day.day)! + day.timing!.driveMinutes + day.timing!.serviceMinutes);
      lastVisitEnd.set(day.day, visitStart + cost);
      const block: DayBlock = { name: sight.name, startMinute: slot?.fixed ? slot.start : undefined,
        description: [...new Set(selections.map((selection) => destinationByName(selection.destination)?.local_sightseeing
          .find((item) => item.name === selection.name)?.client_sentence?.trim() || `Visit ${selection.name}.`))].join(' '), destination: destination.name,
        librarySights: selections.map((selection) => ({ ...selection, visitName: sight.name })),
        reason: 'Selected in the destination library and assigned once across this destination’s visit days.', tags: sight.tags,
        kind: 'sightseeing', source: destination.source, intelligence: { status: 'STANDARD', extraCost: false,
          note: `${cost} estimated minutes including local movement; selection remains editable in the day description.` } };
      day.blocks.push(block);
      day.timing!.scheduledMinutes += cost;
      updateLoad(day);
    }
  }
  // Two overlapping guides can prescribe incompatible sequences for the same
  // physical visit. Do not repeat that visit or invent a new route to conceal
  // the conflict; keep its explicit excursion owner and flag it for review.
  for (const destination of destinations) {
    const checked = new Set(enabledSightseeing(destination));
    let previous: { day: DayPlan; name: string } | undefined;
    for (const sight of destination.local_sightseeing.filter((sight) => checked.has(sight.name))) {
      const day = days.find((day) => day.blocks.some((block) => block.librarySights?.some((source) => source.destination === destination.name && source.name === sight.name)));
      if (!day) continue;
      if (previous && day.day < previous.day.day) {
        const message = `${destination.name} library order conflicts with a shared visit: ${previous.name} is on day ${previous.day.day}, before ${sight.name} in the library. Review the library order or visit days.`;
        previous.day.timing!.advisories!.push(message); day.timing!.advisories!.push(message);
      }
      previous = { day, name: sight.name };
    }
  }
  for (const day of days) {
    const timing = day.timing!;
    if (timing.overrunMinutes) timing.advisories!.push('All selected places are included. Review the estimated visit durations or refine the description to match your preferred pace.');
    day.blocks.sort((a, b) => {
      const rank = (block: DayBlock) => block.kind === 'arrival' ? -1 : 0;
      return rank(a) - rank(b);
    });
    if (day.dayTripDestination) {
      const sights = day.blocks.filter((block) => block.destination === day.dayTripDestination && block.kind === 'sightseeing');
      day.blocks = [...day.blocks.filter((block) => !sights.includes(block)), {
        name: `${day.dayTripDestination} day trip`, description: `Day visit to ${day.dayTripDestination}.`, destination: day.dayTripDestination,
        reason: 'The visit uses the same timed sightseeing allocation as the client description.',
        sights: sights.map((block) => block.name), librarySights: sights.flatMap((block) => block.librarySights || []),
        tags: ['day-trip'], kind: 'sightseeing', intelligence: { status: 'STANDARD' },
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
  const copyIdentity = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const uncheckedCopy = destinations.flatMap((destination) => {
    const checked = new Set(enabledSightseeing(destination));
    return destination.local_sightseeing.filter((sight) => !checked.has(sight.name))
      .map((sight) => copyIdentity(sight.client_sentence?.trim() || `Visit ${sight.name}.`));
  });
  return days.map((day, index) => {
    const previous = original[index];
    day.primaryVisitFor = [...primary.entries()].filter(([, entry]) => entry.day === day.day).map(([name]) => name);
    const context = dayScheduleContext(day);
    const currentCopy = new Set(day.blocks.flatMap((block) => (block.librarySights || []).map((selection) => copyIdentity(
      destinationByName(selection.destination)?.local_sightseeing.find((sight) => sight.name === selection.name)?.client_sentence?.trim() || `Visit ${selection.name}.`,
    ))));
    const obsoleteCopy = previous.customAbout && uncheckedCopy.some((sentence) => !currentCopy.has(sentence) && copyIdentity(previous.customAbout!).includes(sentence));
    // Upgrade older manually edited drafts without discarding unchanged text.
    // Once refreshed, source lines are tracked for all later library edits.
    const legacyManual = previous.customAbout?.trim() && previous.customAboutContext && !obsoleteCopy &&
      !previous.blocks.some((block) => block.librarySights) &&
      previous.customAboutContext === dayScheduleContext(previous, false) &&
      dayScheduleContext(previous, false) === dayScheduleContext(day, false);
    const previousSources = previous.blocks.flatMap((block) => block.librarySights || []);
    const sourcesStillOrdered = destinations.every((destination) => {
      const names = destination.local_sightseeing.map((sight) => sight.name);
      const ranks = previousSources.filter((source) => source.destination === destination.name).map((source) => names.indexOf(source.name));
      return ranks.every((rank, index) => rank >= 0 && (!index || rank >= ranks[index - 1]));
    });
    const legacyOrderContext = previous.customAbout?.trim() && !obsoleteCopy && sourcesStillOrdered &&
      previous.customAboutContext === dayScheduleContext(previous, true, false) &&
      dayScheduleContext(previous, true, false) === dayScheduleContext(day, true, false);
    const changed = !legacyManual && !legacyOrderContext && (previous.customAboutContext || dayScheduleContext(previous)) !== context;
    return { ...day,
      timing: { ...day.timing!, issues: !changed && previous.customAbout?.trim() ? day.timing!.issues.filter((issue) => !issue.includes('the selected programme needs a visit day')) : day.timing!.issues },
      customAbout: changed ? undefined : previous.customAbout,
      customAboutContext: changed ? undefined : previous.customAbout?.trim() ? context : previous.customAboutContext,
      previousCustomAbout: changed ? previous.customAbout || previous.previousCustomAbout : previous.previousCustomAbout };
  });
}
