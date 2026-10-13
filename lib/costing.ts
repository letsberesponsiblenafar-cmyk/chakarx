import type { Plan } from '@/lib/itinerary';
import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import { priceTrip } from '@/lib/pricing';
import { quotedActivityCost, tripActivities } from '@/lib/activities';
import { activeHotelSelections, hotelNightNumbers, hotelStayLabel } from '@/lib/accommodation';
import { effectiveHotelSelection, hotelOptions } from '@/lib/hotel-options';

export function calculateCosts(plan: Plan, hotels: HotelSelection[], model: CostModel) {
  const activeStays = activeHotelSelections(plan, hotels);
  const accommodation = activeStays.reduce((sum, h) => {
    const nights = hotelNightNumbers(plan, h).length;
    const quoted = effectiveHotelSelection(h, plan.input.hotelOptionMode);
    return sum + nights * quoted.rooms * quoted.nightlyRate + nights * quoted.extraBeds * quoted.extraBedRate + nights * quoted.cnb * quoted.cnbRate;
  }, 0);
  // A private vehicle is reserved throughout the package, including local
  // sightseeing and the final drop. Route-leg charges alone omit those days.
  const vehicleDays = plan.dayPlans.length;
  // Meal-plan choice remains part of the client brief, but meal pricing is intentionally
  // not added to Others. Operators enter only genuine additional package costs there.
  const meals = 0;
  const activities = tripActivities(plan, undefined, model.activitySelections).reduce((sum, activity) => sum + (quotedActivityCost(model.activityCosts, activity, model.activitySelections) ?? 0), 0);
  const priced = priceTrip({ accommodation, vehicleDays, transportDaily: model.transportDaily, other: model.otherAmount + activities, profitPct: model.profitPct });
  const people = plan.input.adults + plan.input.youngAges.length;
  const missingHotelRates = [
    ...plan.hotelPlans.filter((stay) => !activeStays.some((hotel) => hotel.location === stay.location)).map((stay) => stay.location),
    ...activeStays.filter((hotel) => hotelOptions(hotel, plan.input.hotelOptionMode).some((option) => !option.hotelName?.trim() || /^(?:hotel|houseboat) to be (?:added|confirmed)$/i.test(option.hotelName.trim()) || !Number.isFinite(option.nightlyRate) || option.nightlyRate <= 0)).map(hotelStayLabel),
  ];
  return { ...priced, meals, activities, preGst: priced.b2bCost, people, missingHotelRates };
}
