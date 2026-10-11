import { destinationByName, destinations, enabledSightseeing, type Destination, type Sightseeing, type VisitWindow } from '@/lib/data';
import { seasonMatches } from '@/lib/seasons';
import { quotedActivityCost } from '@/lib/activities';
import { isGurezAllowed } from '@/lib/intelligence';
import type { DayBlock, DayPlan, TripInput } from '@/lib/itinerary';

export type ScheduleQuote = { activityCosts: Record<string, number>; activitySelections?: Record<string, boolean> };

// Rule order is deliberate: fixed route -> usable window -> quoted activities
// -> available unique sights -> client copy. Nothing below can change a route,
// promise an unavailable activity, or create time that the day does not have.
const clockMinutes = (time?: string) => time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
const positiveMinutes = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! >= 0 ? Math.round(value!) : fallback;
const key = (destination: string, name: string) => `${destination}\u001f${name}`;
const sightIdentity = (name: string) => (/^floating market/i.test(name) ? 'floating market' : name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function windowFor(day: DayPlan, input: TripInput) {
  const startOfDay = input.style === 'Relaxed' ? 9 * 60 : input.style === 'Packed' ? 8 * 60 : 8 * 60 + 30;
  const endOfDay = input.style === 'Packed' ? 19 * 60 : 18 * 60 + 30;
  let start = startOfDay; let end = endOfDay;
  const departure = day.label === 'Departure day';
  const driveMinutes = Math.ceil(day.drive.hours * 60);
  const serviceMinutes = departure ? 30 : 75 + (day.transfer ? 45 : 0);
  const accessMinutes = positiveMinutes(day.drive.access_minutes, 0);
  const transferMinutes = driveMinutes + serviceMinutes + accessMinutes;
  if (day.day === 1) {
    start = Math.max(start, (clockMinutes(input.arrivalTime) ?? 12 * 60 + 30) + 90);
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
  return { startMinutes: start, endMinutes: end, availableMinutes, driveMinutes, serviceMinutes: serviceMinutes + accessMinutes, scheduledMinutes: 0, remainingMinutes, issues };
}

function visiting(day: DayPlan, name: string) {
  if (day.dayTripDestination) return day.dayTripDestination === name;
  if (day.label === 'Departure day') return day.stay === name;
  return day.stay === name || (day.transfer && day.from === name && day.drive.hours <= 3.5);
}
function activityVisiting(day: DayPlan, name: string) {
  // Excursions can leave time for an experience at the overnight base too.
  return visiting(day, name) || Boolean(day.dayTripDestination && (day.stay === name || day.from === name));
}

function seasonEligible(sight: Sightseeing, destination: Destination, date: string) {
  // An explicit operator availability list is authoritative. The season field
  // is a recommendation default for older records with no availability choice.
  if (destination.enabled_sightseeing !== undefined) return true;
  return seasonMatches(sight.season || destination.season || 'all', date) !== false;
}

function sightCost(sight: Sightseeing, destination: Destination, day: DayPlan) {
  const linked = day.scheduledActivities?.some((activity) => activity.destination === destination.name &&
    destination.activity_timing?.[activity.name]?.sight_names?.includes(sight.name));
  return linked ? 0 : positiveMinutes(sight.visit_minutes, 60) + positiveMinutes(sight.transfer_minutes, 20);
}

export function dayScheduleContext(day: DayPlan) {
  return JSON.stringify([day.date, day.from, day.to, day.stay, day.dayTripDestination, day.arrivalTime, day.departureTime, day.drive.hours, day.drive.km, day.drive.via || [],
    day.blocks.filter((block) => block.kind !== 'arrival').map((block) => [block.name, block.description, block.destination, block.sights]),
    [day.stay, day.dayTripDestination, day.from].map((name) => name ? destinationByName(name)?.day_note : null),
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
    if (early && (day.day === 1 || day.transfer || day.dayTripDestination || day.label === 'Departure day')) return null;
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
      .sort((a, b) => (b.timing!.remainingMinutes + (!b.transfer ? 90 : 0)) - (a.timing!.remainingMinutes + (!a.transfer ? 90 : 0)) || a.day - b.day)[0];
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

  const used = new Set<string>();
  for (let index = 0; index < days.length; index++) {
    const day = days[index]; const timing = day.timing!;
    for (const block of day.blocks.filter((block) => block.kind === 'custom')) {
      const cost = 60;
      timing.scheduledMinutes += cost; timing.remainingMinutes = Math.max(0, timing.remainingMinutes - cost);
      if (timing.scheduledMinutes + timing.driveMinutes + timing.serviceMinutes > timing.availableMinutes) timing.issues.push('A manually added stop exceeds the available time. Review this day.');
    }
    if (timing.issues.some((issue) => /transfers|road distance|not permitted|Gurez|previous night/.test(issue))) continue;
    const names = day.dayTripDestination ? [day.dayTripDestination]
      : day.label === 'Departure day' ? [day.stay]
      : day.transfer && day.from !== day.stay && day.drive.hours <= 3.5 ? [day.from, day.stay] : [day.stay];
    for (const name of names) {
      const destination = destinationByName(name); if (!destination) continue;
      const active = new Set(enabledSightseeing(destination));
      const future = days.slice(index + 1).filter((other) => visiting(other, name) && other.timing!.remainingMinutes > 0);
      const futureFullDay = future.some((other) => !other.transfer && other.label !== 'Departure day' && !other.dayTripDestination);
      const transferArrival = day.transfer && name === day.stay && (day.drive.hours >= 3 || (futureFullDay && day.drive.hours >= 2));
      const originStop = day.transfer && day.from !== day.stay && name === day.from;
      const candidates = destination.local_sightseeing.filter((sight) => active.has(sight.name) && !used.has(sightIdentity(sight.name)) && seasonEligible(sight, destination, day.date))
        .filter((sight) => !sight.requires_activity || day.scheduledActivities!.some((activity) => activity.destination === name && activity.name === sight.requires_activity))
        .filter((sight) => !(originStop || transferArrival) || sight.arrival_suitable === true)
        .sort((a, b) => {
          const interest = (sight: Sightseeing) => sight.tags.reduce((sum, tag) => sum + (input.interests.some((item) => item.toLowerCase() === tag.toLowerCase()) ? 1 : 0), 0);
          const linked = (sight: Sightseeing) => sightCost(sight, destination, day) === 0 ? 100 : 0;
          return linked(b) - linked(a) || interest(b) - interest(a);
        });
      const remainingCapacity = timing.remainingMinutes + future.reduce((sum, other) => sum + other.timing!.remainingMinutes, 0);
      const fairShare = future.length ? Math.max(1, Math.ceil(candidates.length * timing.remainingMinutes / Math.max(1, remainingCapacity))) : candidates.length;
      let selected = 0; let cluster = '';
      for (const sight of candidates) {
        if (selected >= fairShare && sightCost(sight, destination, day) > 0) continue;
        const cost = sightCost(sight, destination, day);
        const slot = slotFor(day, sight.time_window, cost);
        if (!slot) continue;
        // Another area needs its own local movement allowance. The recorded
        // per-stop transfer already covers travel within the same cluster.
        const areaBuffer = cluster && sight.cluster && cluster !== sight.cluster ? 15 : 0;
        if (cost + areaBuffer > timing.remainingMinutes + slot.available - slot.service) continue;
        reserveSlot(day, slot);
        const block: DayBlock = { name: sight.name, startMinute: slot.fixed ? slot.start : undefined, description: sight.client_sentence || `Visit ${sight.name}.`, destination: name,
          reason: 'Selected from the destination library within the day’s remaining time.', tags: sight.tags,
          kind: 'sightseeing', source: destination.source, intelligence: { status: 'STANDARD', extraCost: false, note: `${cost + areaBuffer} planning minutes including local movement.` } };
        day.blocks.push(block); used.add(sightIdentity(sight.name)); selected++;
        timing.scheduledMinutes += cost + areaBuffer; timing.remainingMinutes -= cost + areaBuffer;
        cluster = sight.cluster || cluster;
      }
    }
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
    if (!hasVisits && (day.dayTripDestination || (!day.transfer && day.label !== 'Departure day'))) timing.issues.push('No visits fit this day. Enable suitable places in the library, adjust the journey, or add an included activity.');
  }

  const primary = new Map<string, { day: number; score: number }>();
  for (const day of days) for (const destination of destinations) {
    const score = day.blocks.filter((block) => block.destination === destination.name && block.kind === 'sightseeing').reduce((total, block) => total + (block.sights?.length || 1), 0)
      + day.scheduledActivities!.filter((activity) => activity.destination === destination.name).length;
    if (score && score > (primary.get(destination.name)?.score || 0)) primary.set(destination.name, { day: day.day, score });
  }
  return days.map((day, index) => {
    const previous = original[index];
    const changed = (previous.customAboutContext || dayScheduleContext(previous)) !== dayScheduleContext(day);
    return { ...day, primaryVisitFor: [...primary.entries()].filter(([, entry]) => entry.day === day.day).map(([name]) => name),
      timing: { ...day.timing!, issues: !changed && previous.customAbout?.trim() ? day.timing!.issues.filter((issue) => !issue.startsWith('No visits fit this day.')) : day.timing!.issues },
      customAbout: changed ? undefined : previous.customAbout,
      customAboutContext: changed ? undefined : previous.customAboutContext,
      previousCustomAbout: changed ? previous.customAbout || previous.previousCustomAbout : previous.previousCustomAbout };
  });
}
