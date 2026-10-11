import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import type { Hotel } from '@/lib/data';
import { arrivalDayVisitAllowed, requiresSrinagarFinalNight, type Plan, type TripInput } from '@/lib/itinerary';
import { activitySelected, quotedActivityCost, tripActivities } from '@/lib/activities';
import { hotelRateValidity, stayDateWindow } from '@/lib/hotel-rate-validity';
import { sameHotelDestination } from '@/lib/hotels';

export function hotelConfirmationSignature(plan: Plan, hotel: HotelSelection, mealPlan: string) {
  const window = stayDateWindow(plan.dayPlans.slice(0, plan.nights), hotel.location);
  const nightDates = plan.dayPlans.slice(0, plan.nights).filter((day) => day.stay === hotel.location).map((day) => day.date);
  return JSON.stringify([hotel.location, window.arrival, window.departure, hotel.hotelId, hotel.hotelName, hotel.rooms, hotel.extraBeds, hotel.cnb, hotel.nightlyRate, hotel.extraBedRate, hotel.cnbRate, mealPlan, hotel.nights, nightDates]);
}

export function planInputsNeedRefresh(plan: Plan, input: TripInput) {
  const before = plan.input;
  return before.arrival !== input.arrival || before.departure !== input.departure ||
    (before.arrivalTime || '') !== (input.arrivalTime || '') ||
    (before.departureTime || '') !== (input.departureTime || '') ||
    before.pickup !== input.pickup || before.adults !== input.adults ||
    JSON.stringify(before.youngAges) !== JSON.stringify(input.youngAges) ||
    before.hotelCategory !== input.hotelCategory || before.mealPlan !== input.mealPlan ||
    before.style !== input.style ||
    JSON.stringify(before.interests) !== JSON.stringify(input.interests);
}

export function quoteReadiness(
  plan: Plan,
  input: TripInput,
  hotels: HotelSelection[],
  model: CostModel,
  hotelMaster: Hotel[],
  hotelConnection: string,
  destinationConnection: string,
) {
  const issues: string[] = [];
  for (const day of plan.dayPlans) for (const issue of day.timing?.issues || []) issues.push(`Day ${day.day}: ${issue}`);
  if (planInputsNeedRefresh(plan, input)) issues.push('Rebuild the itinerary after changing trip details.');
  if (requiresSrinagarFinalNight(input) && plan.dayPlans[plan.nights - 1]?.stay !== 'Srinagar') issues.push('Keep the final night in Srinagar for departures at or before 2:00 pm.');
  if (hotelConnection !== 'ready') issues.push('Load the hotel database before sharing a quote.');
  if (destinationConnection !== 'ready') issues.push('Load the destination library before sharing a quote.');
  const arrivalVisit = plan.dayPlans[0]?.dayTripDestination;
  if (arrivalVisit && !arrivalDayVisitAllowed(plan.input, arrivalVisit)) issues.push(`The arrival-day visit to ${arrivalVisit} needs a verified early arrival time or a different day.`);
  for (const location of new Set(plan.dayPlans.slice(0, plan.nights).map((day) => day.stay))) {
    if (!plan.hotelPlans.some((stay) => stay.location === location)) issues.push(`Add the ${location} overnight allocation to Hotels.`);
  }
  for (const selected of hotels) {
    if (!plan.hotelPlans.some((stay) => stay.location === selected.location)) issues.push(`Remove the ${selected.location} hotel; this destination has no overnight stay in the current route.`);
    if (hotels.filter((hotel) => hotel.location === selected.location).length > 1) issues.push(`Keep one hotel selection for ${selected.location}.`);
  }
  for (const stay of plan.hotelPlans) {
    const routeNights = plan.dayPlans.slice(0, plan.nights).filter((day) => day.stay === stay.location).length;
    if (routeNights !== stay.nights) issues.push(`Update the ${stay.location} hotel nights to match the overnight route.`);
    const selected = hotels.find((hotel) => hotel.location === stay.location);
    if (!selected || !selected.hotelName || selected.hotelName === 'Hotel to be added' || selected.nightlyRate <= 0) {
      issues.push(`Add a hotel and positive room rate for ${stay.location}.`);
      continue;
    }
    if (selected.nights !== stay.nights) issues.push(`Update the ${stay.location} hotel allocation to ${stay.nights} night${stay.nights === 1 ? '' : 's'} to match the route.`);
    if (selected.rooms < 1) issues.push(`Set the number of rooms in ${stay.location}.`);
    if (!selected.rateConfirmed || selected.confirmedSignature !== hotelConfirmationSignature(plan, selected, input.mealPlan)) issues.push(`Verify the ${stay.location} rate, dates, meal plan and availability in Hotels.`);
    const record = selected.hotelId ? hotelMaster.find((hotel) => hotel.id === selected.hotelId) : null;
    if (selected.hotelId && !record) issues.push(`Reselect the hotel in ${stay.location}; its master record is unavailable.`);
    if (record && !sameHotelDestination(record.destination, stay.location)) issues.push(`Select a hotel in ${stay.location}; the current hotel belongs to ${record.destination}.`);
    if (record && selected.status !== 'user-edited') {
      const window = stayDateWindow(plan.dayPlans.slice(0, plan.nights), stay.location);
      if (hotelRateValidity(record, window.arrival, window.departure) === 'outside') issues.push(`The ${stay.location} master rate is outside the stay dates. Enter a current rate in Hotels.`);
    }
  }
  if (!Number.isFinite(model.transportDaily) || model.transportDaily <= 0 || !input.transport?.trim()) {
    issues.push('Choose a vehicle and enter its positive daily rate.');
  }
  for (const activity of tripActivities(plan, undefined, model.activitySelections)) {
    if (!activity.available && activitySelected(activity, model.activitySelections, model.activityCosts)) issues.push(`${activity.destination}: ${activity.name} is no longer enabled in the destination library; review it.`);
    if (activitySelected(activity, model.activitySelections, model.activityCosts) && quotedActivityCost(model.activityCosts, activity, model.activitySelections) === null) {
      issues.push(`Enter the group price for ${activity.destination}: ${activity.name}, or untick it.`);
    }
    if (quotedActivityCost(model.activityCosts, activity, model.activitySelections) !== null &&
      plan.dayPlans.every((day) => day.scheduledActivities !== undefined) &&
      !plan.dayPlans.some((day) => day.scheduledActivities?.some((scheduled) => scheduled.key === activity.key))) {
      issues.push(`${activity.destination}: ${activity.name} is priced but has no time in the itinerary. Adjust the journey or remove it.`);
    }
    if (/houseboat stay/i.test(activity.name) && quotedActivityCost(model.activityCosts, activity, model.activitySelections) !== null &&
      !hotels.some((hotel) => hotel.location === activity.destination && /houseboat/i.test(`${hotel.hotelName} ${hotel.roomType}`))) {
      issues.push('Houseboat stay is included as an activity, but no houseboat hotel is selected. Select the houseboat or remove the activity.');
    }
  }
  return [...new Set(issues)];
}
