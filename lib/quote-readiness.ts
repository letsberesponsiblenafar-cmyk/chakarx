import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import type { Hotel } from '@/lib/data';
import { arrivalDayVisitAllowed, type Plan } from '@/lib/itinerary';
import { activitySelected, quotedActivityCost, tripActivities } from '@/lib/activities';
import { hotelRateValidity, stayDateWindow } from '@/lib/hotel-rate-validity';

export function hotelConfirmationSignature(plan: Plan, hotel: HotelSelection, mealPlan: string) {
  const window = stayDateWindow(plan.dayPlans.slice(0, plan.nights), hotel.location);
  return JSON.stringify([hotel.location, window.arrival, window.departure, hotel.hotelId, hotel.hotelName, hotel.rooms, hotel.extraBeds, hotel.cnb, hotel.nightlyRate, hotel.extraBedRate, hotel.cnbRate, mealPlan]);
}

export function quoteReadiness(
  plan: Plan,
  hotels: HotelSelection[],
  model: CostModel,
  hotelMaster: Hotel[],
  hotelConnection: string,
  destinationConnection: string,
) {
  const issues: string[] = [];
  if (hotelConnection !== 'ready') issues.push('Load the hotel database before sharing a quote.');
  if (destinationConnection !== 'ready') issues.push('Load the destination library before sharing a quote.');
  const arrivalVisit = plan.dayPlans[0]?.dayTripDestination;
  if (arrivalVisit && !arrivalDayVisitAllowed(plan.input, arrivalVisit)) issues.push(`The arrival-day visit to ${arrivalVisit} needs a verified early arrival time or a different day.`);
  for (const stay of plan.hotelPlans) {
    const selected = hotels.find((hotel) => hotel.location === stay.location);
    if (!selected || !selected.hotelName || selected.hotelName === 'Hotel to be added' || selected.nightlyRate <= 0) {
      issues.push(`Add a hotel and positive room rate for ${stay.location}.`);
      continue;
    }
    if (selected.rooms < 1) issues.push(`Set the number of rooms in ${stay.location}.`);
    if (!selected.rateConfirmed || selected.confirmedSignature !== hotelConfirmationSignature(plan, selected, plan.input.mealPlan)) issues.push(`Verify the ${stay.location} rate, dates, meal plan and availability in Hotels.`);
    const record = selected.hotelId ? hotelMaster.find((hotel) => hotel.id === selected.hotelId) : null;
    if (selected.hotelId && !record) issues.push(`Reselect the hotel in ${stay.location}; its master record is unavailable.`);
    if (record && selected.status !== 'user-edited') {
      const window = stayDateWindow(plan.dayPlans.slice(0, plan.nights), stay.location);
      if (hotelRateValidity(record, window.arrival, window.departure) === 'outside') issues.push(`The ${stay.location} master rate is outside the stay dates. Enter a current rate in Hotels.`);
    }
  }
  if (!Number.isFinite(model.transportDaily) || model.transportDaily <= 0 || !plan.input.transport?.trim()) {
    issues.push('Choose a vehicle and enter its positive daily rate.');
  }
  for (const activity of tripActivities(plan, undefined, model.activitySelections)) {
    if (!activity.available && activitySelected(activity, model.activitySelections, model.activityCosts)) issues.push(`${activity.destination}: ${activity.name} is no longer enabled in the destination library; review it.`);
    if (activitySelected(activity, model.activitySelections, model.activityCosts) && quotedActivityCost(model.activityCosts, activity, model.activitySelections) === null) {
      issues.push(`Enter the group price for ${activity.destination}: ${activity.name}, or untick it.`);
    }
  }
  return [...new Set(issues)];
}
