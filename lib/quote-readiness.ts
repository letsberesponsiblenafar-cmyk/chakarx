import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import type { Hotel } from '@/lib/data';
import { arrivalDayVisitAllowed, requiresSrinagarFinalNight, type Plan, type TripInput } from '@/lib/itinerary';
import { activitySelected, quotedActivityCost, tripActivities } from '@/lib/activities';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';
import { isHouseboatHotel, sameHotelDestination, matchesPackageCategory } from '@/lib/hotels';
import { hotelNightDates, hotelNightNumbers, hotelSelectionKey, hotelStayLabel, hotelStayType, hotelStayWindow } from '@/lib/accommodation';
import { hotelOptions, hotelOptionCategory } from '@/lib/hotel-options';

export function hotelConfirmationSignature(plan: Plan, hotel: HotelSelection, mealPlan: string) {
  const window = hotelStayWindow(plan, hotel);
  const nightDates = hotelNightDates(plan, hotel);
  const signature: unknown[] = [hotelSelectionKey(hotel), window.arrival, window.departure, hotel.hotelId, hotel.hotelName, hotel.rooms, hotel.extraBeds, hotel.cnb, hotel.nightlyRate, hotel.extraBedRate, hotel.cnbRate, mealPlan, hotel.nights, nightDates];
  if (plan.input.hotelOptionMode === 'multiple') signature.push('multiple', hotelOptions(hotel, 'multiple'));
  return JSON.stringify(signature);
}

export function planInputsNeedRefresh(plan: Plan, input: TripInput) {
  const before = plan.input;
  return before.arrival !== input.arrival || before.departure !== input.departure ||
    (before.arrivalTime || '') !== (input.arrivalTime || '') ||
    (before.departureTime || '') !== (input.departureTime || '') ||
    before.pickup !== input.pickup || before.adults !== input.adults ||
    JSON.stringify(before.youngAges) !== JSON.stringify(input.youngAges) ||
    before.hotelCategory !== input.hotelCategory || before.mealPlan !== input.mealPlan ||
    (before.hotelOptionMode || 'single') !== (input.hotelOptionMode || 'single') ||
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
  // Zero-night selections retain the agreed quote when an operator switches
  // between a Srinagar hotel and houseboat; they are not part of this package.
  const selectedStays = hotels.filter((hotel) => hotel.nights > 0);
  for (const selected of selectedStays) {
    const label = hotelStayLabel(selected);
    if (!plan.hotelPlans.some((stay) => stay.location === selected.location)) issues.push(`Remove the ${label} accommodation; this destination has no overnight stay in the current route.`);
    if (hotelStayType(selected) === 'houseboat' && selected.location !== 'Srinagar') issues.push('Houseboat accommodation can only be assigned to Srinagar nights.');
    if (selectedStays.filter((hotel) => hotelSelectionKey(hotel) === hotelSelectionKey(selected)).length > 1) issues.push(`Keep one ${hotelStayType(selected)} selection for ${selected.location}.`);
  }
  for (const stay of plan.hotelPlans) {
    const routeNights = plan.dayPlans.slice(0, plan.nights).map((day, index) => ({ location: day.stay, night: day.day || index + 1 })).filter((day) => day.location === stay.location).map((day) => day.night);
    if (routeNights.length !== stay.nights) issues.push(`Update the ${stay.location} hotel nights to match the overnight route.`);
    const allocations = selectedStays.filter((hotel) => hotel.location === stay.location);
    if (!allocations.length) {
      issues.push(`Add a hotel and positive room rate for ${stay.location}.`);
      continue;
    }
    const coverage = new Map(routeNights.map((night) => [night, 0]));
    for (const selected of allocations) {
      const label = hotelStayLabel(selected);
      const nights = hotelNightNumbers(plan, selected);
      const rawNights = selected.nightNumbers;
      const invalidExplicitNights = rawNights !== undefined && (
        rawNights.length !== selected.nights || new Set(rawNights).size !== rawNights.length ||
        rawNights.some((night) => !Number.isInteger(night) || !coverage.has(night))
      );
      if (invalidExplicitNights || nights.length !== selected.nights) issues.push(`Update the ${label} ${hotelStayType(selected)} allocation to ${nights.length} night${nights.length === 1 ? '' : 's'} to match the overnight route.`);
      for (const night of nights) coverage.set(night, (coverage.get(night) || 0) + 1);
      if (selected.rooms < 1) issues.push(`Set the number of rooms in ${label}.`);
      if (!selected.rateConfirmed || selected.confirmedSignature !== hotelConfirmationSignature(plan, selected, input.mealPlan)) issues.push(`Verify the ${label} rate, dates, meal plan and availability in Hotels.`);
      const options = hotelOptions(selected, plan.input.hotelOptionMode);
      const category = hotelOptionCategory(selected, hotelMaster);
      if (plan.input.hotelOptionMode === 'multiple' && (selected.alternatives || []).length + 1 !== options.length) issues.push(`Keep up to three different properties for ${label}.`);
      for (const option of options) {
        const optionLabel = options.length > 1 ? `${label}: ${option.hotelName || 'unnamed option'}` : label;
        if (!option.hotelName?.trim() || /^(?:hotel|houseboat) to be (?:added|confirmed)$/i.test(option.hotelName.trim()) || !Number.isFinite(option.nightlyRate) || option.nightlyRate <= 0) issues.push(`Add a ${hotelStayType(selected)} and positive room rate for ${optionLabel}.`);
        if (options.length > 1 && category !== null && option.hotelId !== selected.hotelId && option.category !== category) issues.push(`Use the same hotel category for every ${label} option.`);
        if (options.length > 1 && option.hotelId !== selected.hotelId && !matchesPackageCategory({ normalizedCategory: option.category }, input.hotelCategory)) issues.push(`Choose ${input.hotelCategory} properties for the ${label} alternatives.`);
        const record = option.hotelId ? hotelMaster.find((hotel) => hotel.id === option.hotelId) : null;
        if (option.hotelId && !record) issues.push(`Reselect the ${hotelStayType(selected)} in ${optionLabel}; its master record is unavailable.`);
        if (record && !sameHotelDestination(record.destination, stay.location)) issues.push(`Select accommodation in ${stay.location}; the current property belongs to ${record.destination}.`);
        if (record && isHouseboatHotel(record) !== (hotelStayType(selected) === 'houseboat')) issues.push(`Select a ${hotelStayType(selected)} property for ${optionLabel}.`);
        if (!record && options.length > 1 && option.hotelId !== selected.hotelId && isHouseboatHotel({ name: option.hotelName, roomType: option.roomType, sourceCategory: option.category, sourceType: option.source }) !== (hotelStayType(selected) === 'houseboat')) issues.push(`Select a ${hotelStayType(selected)} property for ${optionLabel}.`);
        if (record && option.status !== 'user-edited') {
          const window = hotelStayWindow(plan, selected);
          if (hotelRateValidity(record, window.arrival, window.departure) === 'outside') issues.push(`The ${optionLabel} master rate is outside the stay dates. Enter a current rate in Hotels.`);
        }
      }
    }
    if ([...coverage.values()].some((count) => count !== 1)) issues.push(`Assign every ${stay.location} night to exactly one hotel${stay.location === 'Srinagar' ? ' or houseboat' : ''}.`);
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
      !selectedStays.some((hotel) => hotel.location === activity.destination && hotelStayType(hotel) === 'houseboat' && hotelNightNumbers(plan, hotel).length > 0)) {
      issues.push('Houseboat stay is included as an activity, but no houseboat hotel is selected. Select the houseboat or remove the activity.');
    }
  }
  return [...new Set(issues)];
}
