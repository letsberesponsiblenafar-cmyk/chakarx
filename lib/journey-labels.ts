import type { DayPlan } from '@/lib/itinerary';

/** The sightseeing destination is distinct from the next hotel's location. */
export function dayVisitDestination(day: DayPlan): string {
  if (day.dayTripDestination) return day.dayTripDestination;
  if (day.label === 'Departure day') return day.stay;
  if (day.day > 1 && day.transfer && day.stay === 'Srinagar' && day.from !== day.stay) return day.from;
  return day.stay;
}

/** Only an excursion leaving and returning to the same base is a day visit. */
export function dayVisitLabel(day: DayPlan, destination = dayVisitDestination(day)): string {
  return day.from === day.stay && destination !== day.from
    ? `${destination} day visit`
    : `${destination}${destination === 'Srinagar' ? ' local' : ''} sightseeing`;
}
