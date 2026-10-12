import { createPlan, rebuildPlanFromNightSequence, type DayPlan, type Plan, type TripInput } from '@/lib/itinerary';
import { departureForNights, tripDuration } from '@/lib/trip-dates';

function withoutStaleCopy(day: DayPlan): DayPlan {
  return { ...day, customTitle: undefined, customAbout: undefined, customAboutContext: undefined,
    previousCustomAbout: day.customAbout || day.previousCustomAbout };
}

/** Refresh logistics around choices retained for an unchanged trip length. */
function rebuildChosenDays(plan: Plan, input: TripInput, sequence: string[], previousDays: DayPlan[]): Plan {
  const departure = plan.dayPlans[plan.days - 1];
  const seedDays = sequence.map((stay, index): DayPlan => {
    const from = index ? sequence[index - 1]
      : input.pickup.toLowerCase().includes('srinagar') ? 'Srinagar' : input.pickup;
    const previous = previousDays[index];
    if (previous) {
      const retained = previous.from === from && previous.stay === stay ? previous : withoutStaleCopy(previous);
      return { ...retained, day: index + 1, from, to: stay, stay,
        // Undefined meant a generated local day in older drafts. Make that
        // choice explicit so rebuilding cannot introduce a new excursion.
        dayTripDestination: previous.dayTripDestination ?? null };
    }
    return { ...withoutStaleCopy(departure), day: index + 1, label: index ? 'Explore' : 'Arrival day',
      from, to: stay, stay, transfer: from !== stay, blocks: [], notes: [],
      dayTripDestination: null, previousCustomAbout: undefined, scheduledActivities: [], timing: undefined };
  });
  const seed: Plan = { ...plan, input, nights: sequence.length, days: sequence.length + 1,
    dayPlans: [...seedDays, { ...departure, day: sequence.length + 1 }] };
  const rebuilt = rebuildPlanFromNightSequence(seed, sequence);
  return { ...rebuilt, hotelPlans: rebuilt.hotelPlans.map((stay) => {
    const existing = plan.hotelPlans.find((hotel) => hotel.location === stay.location);
    return existing ? { ...stay, candidate: existing.candidate } : stay;
  }) };
}

/** Replan a new trip length; retain operator route choices for other brief edits. */
export function editTripPlan(plan: Plan, input: TripInput): Plan {
  const duration = tripDuration(input.arrival, input.departure);
  if (!duration) throw new Error('Choose valid travel dates for a trip of 1 to 30 nights.');
  // A different number of nights changes which destinations, day visits and
  // overnight stays fit. Start a fresh programme, then let the planner state
  // reconcile the existing hotel and service quote with its new quantities.
  if (duration.nights !== plan.nights) return createPlan(input);
  const previousDays = plan.dayPlans.slice(0, plan.nights);
  const sequence = previousDays.map((day) => day.stay);
  return rebuildChosenDays(plan, input, sequence, previousDays);
}

/** Removing a day changes the trip length, so recommend the whole shorter journey. */
export function removeTripDay(plan: Plan, dayNumber: number): Plan {
  if (plan.nights <= 1) throw new Error('Keep at least one overnight stay in the trip.');
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > plan.days) throw new Error('Choose an existing trip day to remove.');
  const departure = departureForNights(plan.input.arrival, plan.nights - 1);
  if (!departure) throw new Error('Choose valid travel dates before changing the trip duration.');
  return editTripPlan(plan, { ...plan.input, departure });
}
