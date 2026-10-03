import type { Plan } from '@/lib/itinerary';
import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import { priceTrip } from '@/lib/pricing';
import { quotedActivityCost, tripActivities } from '@/lib/activities';

export function calculateCosts(plan: Plan, hotels: HotelSelection[], model: CostModel) {
  const accommodation = hotels.reduce((sum, h) => {
    return sum + h.nights * h.rooms * h.nightlyRate + h.nights * h.extraBeds * h.extraBedRate + h.nights * h.cnb * h.cnbRate;
  }, 0);
  // A private vehicle is reserved throughout the package, including local
  // sightseeing and the final drop. Route-leg charges alone omit those days.
  const vehicleDays = plan.dayPlans.length;
  // Meal-plan choice remains part of the client brief, but meal pricing is intentionally
  // not added to Others. Operators enter only genuine additional package costs there.
  const meals = 0;
  const activities = tripActivities(plan).reduce((sum, activity) => sum + (quotedActivityCost(model.activityCosts, activity) ?? 0), 0);
  const priced = priceTrip({ accommodation, vehicleDays, transportDaily: model.transportDaily, other: model.otherAmount + activities, profitPct: model.profitPct });
  const people = plan.input.adults + plan.input.youngAges.length;
  const missingHotelRates = hotels.filter((h) => !h.hotelName || h.hotelName === 'Hotel to be added' || h.nightlyRate <= 0).map((h) => h.location);
  return { ...priced, meals, activities, preGst: priced.b2bCost, people, missingHotelRates };
}
