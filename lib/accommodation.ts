import type { HotelSelection } from '@/components/PlannerProvider';
import type { DayPlan, Plan } from '@/lib/itinerary';
import { isHouseboatHotel } from '@/lib/hotels';
import { stayDateWindow } from '@/lib/hotel-rate-validity';
import { dayNarrative, type NarrativeQuote } from '@/lib/narrative';
import { withPlanDestinations } from '@/lib/plan-destinations';

export type AccommodationType = 'hotel' | 'houseboat';

/** Older saved quotes may identify a houseboat through its property details. */
export function hotelStayType(hotel: HotelSelection): AccommodationType {
  return hotel.accommodationType || (isHouseboatHotel({ name: hotel.hotelName, roomType: hotel.roomType,
    sourceCategory: hotel.category, sourceType: hotel.source }) ? 'houseboat' : 'hotel');
}

/** Ordinary hotel keys stay compatible with existing destination-based edits. */
export function hotelSelectionKey(hotel: HotelSelection) {
  return hotelStayType(hotel) === 'houseboat' ? `${hotel.location}\u001fhouseboat` : hotel.location;
}

export function hotelStayLabel(hotel: HotelSelection) {
  return hotelStayType(hotel) === 'houseboat' ? `${hotel.location} · Houseboat` : hotel.location;
}

export function hotelNightNumbers(plan: Plan, hotel: HotelSelection): number[] {
  const route = (plan.dayPlans || []).slice(0, plan.nights).flatMap((day, index) =>
    day.stay === hotel.location ? [day.day || index + 1] : []);
  const requested = hotel.nightNumbers === undefined ? route : hotel.nightNumbers;
  return [...new Set(requested)].filter((night) => route.includes(night)).sort((a, b) => a - b);
}

export function hotelNightDates(plan: Plan, hotel: HotelSelection): string[] {
  const numbers = hotelNightNumbers(plan, hotel);
  return (plan.dayPlans || []).slice(0, plan.nights).filter((day, index) =>
    day.stay === hotel.location && numbers.includes(day.day || index + 1)).map((day) => day.date);
}

export function hotelStayWindow(plan: Plan, hotel: HotelSelection) {
  return stayDateWindow(hotelNightDates(plan, hotel).map((date) => ({ date, stay: hotel.location })), hotel.location);
}

/** Zero-night rows retain a chosen quote but never become a charged stay. */
export function activeHotelSelections(plan: Plan, hotels: HotelSelection[]) {
  return hotels.filter((hotel) => hotel.nights > 0 && plan.hotelPlans.some((stay) => stay.location === hotel.location));
}

export function hotelForNight(plan: Plan, hotels: HotelSelection[], dayNumber: number) {
  return activeHotelSelections(plan, hotels).find((hotel) => hotelNightNumbers(plan, hotel).includes(dayNumber));
}

export function accommodationDayNarrative(plan: Plan, hotels: HotelSelection[], day: DayPlan, pickup: string, quote?: NarrativeQuote) {
  const current = hotelForNight(plan, hotels, day.day);
  const previous = hotelForNight(plan, hotels, day.day - 1);
  return withPlanDestinations(plan, () => dayNarrative(day, pickup, quote, {
    current: current ? hotelStayType(current) : 'hotel',
    previous: previous ? hotelStayType(previous) : 'hotel',
  }));
}
