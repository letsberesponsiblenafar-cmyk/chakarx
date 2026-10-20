import type { HotelSelection, PlannerState } from '@/components/PlannerProvider';
import { activeHotelSelections, hotelSelectionKey, hotelStayLabel, hotelStayType } from '@/lib/accommodation';
import { hotelOptions, hotelOptionIdentity, hotelOptionMatchesCategory, isUnusedHotelOption, sharedCustomHotelRates } from '@/lib/hotel-options';
import { isHouseboatHotel, matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';
import { packageCategories, packageView } from '@/lib/package-quotes';
import { hotelConfirmationSignature } from '@/lib/quote-readiness';
import { savedHotelMaster } from '@/lib/saved-plan-data';

/** Validate entered values, not whether the operator has edited an imported rate. */
export function hotelRateProblems(state: PlannerState): string[] {
  if (!state.plan) return ['Choose your destinations first.'];
  const db = savedHotelMaster(state.plan, state.hotelDatabase);
  const mode = state.plan.input.hotelOptionMode || 'single';
  return activeHotelSelections(state.plan, state.hotelSelections).flatMap((hotel) => {
    const label = hotelStayLabel(hotel);
    if (!Number.isInteger(hotel.rooms) || hotel.rooms < 1) return [`Enter the number of rooms for ${label}.`];
    if ([hotel.extraBeds, hotel.cnb].some((count) => !Number.isInteger(count) || count < 0)) return [`Enter valid guest counts for ${label}.`];
    const offered = hotelOptions(hotel, mode);
    const shared = sharedCustomHotelRates(hotel, mode);
    if (shared && (!Number.isFinite(shared.nightlyRate) || shared.nightlyRate <= 0)) return [`Enter the highest supplier room rate for ${label}.`];
    if (shared && [shared.extraBedRate, shared.cnbRate].some((value) => !Number.isFinite(value) || value < 0)) return [`Enter valid extra-bed and child rates for ${label}.`];
    if (mode === 'multiple' && (hotel.alternatives || []).filter((option) => !isUnusedHotelOption(option)).length + 1 !== offered.length) return [`Choose up to three different properties for ${label}.`];
    return offered.flatMap((option) => {
      const name = option.hotelName?.trim();
      if (!name || /^(?:hotel|houseboat) to be (?:added|confirmed)$/i.test(name)) return [`Choose a ${hotelStayType(hotel)} in ${hotel.location}.`];
      if (!shared && (!Number.isFinite(option.nightlyRate) || option.nightlyRate <= 0)) return [`Enter the room rate for ${name}.`];
      if (!shared && [option.extraBedRate, option.cnbRate].some((value) => !Number.isFinite(value) || value < 0)) return [`Enter valid extra-bed and child rates for ${name}.`];
      const alternative = offered.length > 1 && hotelOptionIdentity(option) !== hotelOptionIdentity(hotel);
      if (alternative && !hotelOptionMatchesCategory(hotel, option, db)) return [`Choose the same category for every ${label} option.`];
      const record = db.find((item) => item.id === option.hotelId);
      if (alternative && !option.customId && !matchesPackageCategory(record || { normalizedCategory: option.category }, state.input.hotelCategory)) return [`Choose ${state.input.hotelCategory} properties for the ${label} alternatives.`];
      if (option.hotelId && !record) return [`Reselect ${name}; its database record is unavailable.`];
      if (record && !sameHotelDestination(record.destination, hotel.location)) return [`Choose a property in ${hotel.location}.`];
      if (record && isHouseboatHotel(record) !== (hotelStayType(hotel) === 'houseboat')) return [`Choose a ${hotelStayType(hotel)} property for ${label}.`];
      if (!record && !option.customId && alternative && isHouseboatHotel({ name, roomType: option.roomType, sourceCategory: option.category, sourceType: option.source }) !== (hotelStayType(hotel) === 'houseboat')) return [`Choose a ${hotelStayType(hotel)} property for ${label}.`];
      return [];
    });
  });
}

export function hotelConfirmationSummary(state: PlannerState) {
  const categories = packageCategories(state.plan?.input || state.input);
  const packages = categories.map((category) => {
    const view = packageView(state, category);
    const stays = view.plan ? activeHotelSelections(view.plan, view.hotelSelections) : [];
    return { category, view, stays, problems: hotelRateProblems(view) };
  });
  const count = packages.reduce((sum, item) => sum + item.stays.length, 0);
  const problems = packages.flatMap((item) => item.problems.map((problem) => categories.length > 1 ? `${item.category}: ${problem}` : problem));
  const complete = count > 0 && packages.every((item) => item.stays.length > 0) && problems.length === 0;
  const confirmed = complete && packages.every(({ view, stays }) => stays.every((hotel) => hotel.rateConfirmed && hotel.confirmedSignature === hotelConfirmationSignature(view.plan!, hotel, view.input.mealPlan)));
  return { packages, count, problems: [...new Set(problems)], complete, confirmed };
}

/** One atomic confirmation covers all offered packages without repricing anything. */
export function confirmHotelRatesInState(state: PlannerState, confirmed: boolean): PlannerState {
  const summary = hotelConfirmationSummary(state);
  if (!state.plan || confirmed && !summary.complete) return state;
  let next = { ...state, packageQuotes: { ...state.packageQuotes } };
  for (const { category, view, stays } of summary.packages) {
    const activeKeys = new Set(stays.map(hotelSelectionKey));
    const hotelSelections = view.hotelSelections.map((hotel): HotelSelection => activeKeys.has(hotelSelectionKey(hotel)) ? {
      ...hotel, rateConfirmed: confirmed,
      confirmedSignature: confirmed ? hotelConfirmationSignature(view.plan!, hotel, view.input.mealPlan) : undefined,
    } : hotel);
    if (category === state.plan.input.hotelCategory) next = { ...next, hotelSelections };
    else next.packageQuotes[category] = { ...state.packageQuotes?.[category], hotelSelections };
  }
  return next;
}
