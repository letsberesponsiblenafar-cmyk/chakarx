import type { Plan } from '@/lib/itinerary';
import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import { priceTrip } from '@/lib/pricing';
import { quotedActivityCost, tripActivities } from '@/lib/activities';

export function calculateCosts(plan: Plan, hotels: HotelSelection[], model: CostModel) {
  const accommodation = plan.hotelPlans.reduce((sum, stay) => {
    const h = hotels.find((hotel) => hotel.location === stay.location);
    if (!h) return sum;
    return sum + stay.nights * h.rooms * h.nightlyRate + stay.nights * h.extraBeds * h.extraBedRate + stay.nights * h.cnb * h.cnbRate;
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
  const missingHotelRates = plan.hotelPlans.filter((stay) => {
    const h = hotels.find((hotel) => hotel.location === stay.location);
    return !h || !h.hotelName || h.hotelName === 'Hotel to be added' || h.nightlyRate <= 0;
  }).map((stay) => stay.location);
  return { ...priced, meals, activities, preGst: priced.b2bCost, people, missingHotelRates };
}
