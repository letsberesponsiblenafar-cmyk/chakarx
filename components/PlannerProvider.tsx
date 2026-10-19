'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPlan, reschedulePlan, retargetDay, rebuildPlanFromNightSequence, setPlanDayTrip, setPlanDeparturePoint, validatedTripInput, ROUTE_VERSION, type Plan, type TripInput } from '@/lib/itinerary';
import { editTripPlan, removeTripDay } from '@/lib/trip-edits';
import { tripActivityDestinations } from '@/lib/activities';
import { departureForNights } from '@/lib/trip-dates';
import { hotelDatabase as importedHotels, hotelCategories, mealOptions, transportOptions, travelStyles, interests, destinations, destinationByName, replaceDestinationCatalog, replaceArchivedDestinationCatalog, archivedDestinationCatalog, type Destination, type Hotel } from '@/lib/data';
import { firstHotelCandidate, roomsRequired, cnbChildren, extraBedsRequired, matchesPackageCategory, suggestedHotel, isHouseboatHotel, sameHotelDestination } from '@/lib/hotels';
import { stayDateWindow } from '@/lib/hotel-rate-validity';
import { hotelSelectionKey, hotelStayType, hotelNightDates, type AccommodationType } from '@/lib/accommodation';
import { dayScheduleContext } from '@/lib/day-scheduler';
import { initialPackageDefaults, validatePackageDefaults, type PackageDefaults } from '@/lib/package-defaults';
import { withPlanDestinations } from '@/lib/plan-destinations';
import { allHotelOptionsCustom, highestCompleteHotelRates, sharedCustomHotelRates, hotelAlternativeCandidates, hotelOptionCategory, hotelOptionFromSelection, hotelOptionIdentity, sameHotelOption, type HotelOptionQuote, type HotelRateBundle } from '@/lib/hotel-options';
import { hotelConfirmationSignature } from '@/lib/quote-readiness';
import { packageCategories, packageView, validPackageQuotes, type PackageQuote } from '@/lib/package-quotes';

export type HotelSelection = {
  location: string; hotelId: string; hotelName: string; category: string; starRating: number | null; address: string; roomType: string; website: string;
  nights: number; rooms: number; extraBeds: number; cnb: number; nightlyRate: number; extraBedRate: number; cnbRate: number; source: string; status: string; rateConfirmed?: boolean; confirmedSignature?: string;
  accommodationType?: AccommodationType; nightNumbers?: number[];
  alternatives?: HotelOptionQuote[];
  /** One negotiated bundle when every offered property is entered manually. */
  sharedCustomRates?: HotelRateBundle;
};
export type CostModel = { transportDaily: number; transportIsCustom: boolean; mealPerPersonNight: number; activityBudget: number; activityCosts: Record<string, number>; activitySelections: Record<string, boolean>; manualInclusions: string[]; manualExclusions: string[]; contingencyPct: number; profitPct: number; otherAmount: number };
export type HotelDefaults = { rooms: number; extraBeds: number; cnb: number; nightlyRate: number; extraBedRate: number; cnbRate: number };
export type PlannerState = { input: TripInput; plan: Plan | null; routeVersion: string | null; hotelSelections: HotelSelection[]; packageQuotes?: Record<string, PackageQuote>; hotelDatabase: Hotel[]; costModel: CostModel; hotelDefaults: HotelDefaults; generated: boolean; savedItineraryId: string | null };
export type ItinerarySnapshot = Omit<PlannerState, 'hotelDatabase' | 'savedItineraryId'>;
export function itinerarySnapshot(state: PlannerState): ItinerarySnapshot {
  return { input: state.input, plan: state.plan, routeVersion: state.routeVersion, hotelSelections: state.hotelSelections, ...(state.packageQuotes ? { packageQuotes: state.packageQuotes } : {}), costModel: state.costModel, hotelDefaults: state.hotelDefaults, generated: state.generated };
}

type PlannerContextValue = PlannerState & {
  updatePackageState: (category: string, update: (state: PlannerState) => PlannerState) => void;
  setPackageTransport: (category: string, vehicle: string | null, custom?: boolean) => void;
  setPackageTransportRate: (category: string, rate: number) => void;
  hydrated: boolean;
  destinationCatalog: Destination[];
  destinationConnection: 'loading' | 'ready' | 'error';
  destinationConnectionError: string;
  /** True only when this request applied a confirmed, current catalogue. */
  refreshDestinations: (rebuildCurrent?: boolean) => Promise<boolean>;
  removeDestinationFromLibrary: (destination: Destination) => void;
  packageDefaults: PackageDefaults;
  packageDefaultsConnection: 'loading' | 'ready' | 'error';
  packageDefaultsError: string;
  refreshPackageDefaults: () => Promise<void>;
  updatePackageDefaults: (defaults: PackageDefaults) => Promise<void>;
  hotelConnection: 'loading' | 'ready' | 'error' | 'signed-out';
  hotelConnectionError: string;
  refreshHotels: () => Promise<void>;
  setInputField: <K extends keyof TripInput>(key: K, value: TripInput[K]) => void;
  setYoungAges: (ages: number[]) => void;
  setInterests: (interests: string[]) => void;
  generate: (overrides?: Partial<TripInput>) => void;
  replanDestinations: () => void;
  setDayDestination: (day: number, destination: string) => void;
  setDayTrip: (day: number, destination: string | null) => void;
  setDeparturePoint: (destination: string) => void;
  setDayContent: (day: number, patch: { title?: string; about?: string }) => void;
  setStayAllocation: (entries: { location: string; nights: number }[]) => void;
  setNightSequence: (sequence: string[]) => void;
  setSrinagarHouseboatNights: (nightNumbers: number[]) => void;
  addDay: () => void;
  removeDay: (day: number) => void;
  replaceHotel: (location: string, hotelId: string) => void;
  useCustomHotel: (location: string) => void;
  replaceHotelAlternative: (location: string, index: number, hotelId: string) => void;
  setCustomHotelAlternative: (location: string, index: number, patch: Partial<Pick<HotelOptionQuote, 'hotelName' | 'nightlyRate' | 'extraBedRate' | 'cnbRate'>>) => void;
  setHotelOptionRate: (location: string, hotelId: string, field: 'nightlyRate' | 'extraBedRate' | 'cnbRate', value: number) => void;
  setSharedCustomHotelRate: (location: string, field: keyof HotelRateBundle, value: number) => void;
  setHotelRate: (location: string, field: 'nightlyRate' | 'extraBedRate' | 'cnbRate', value: number) => void;
  setHotelMeta: (location: string, patch: Partial<HotelSelection>) => void;
  setHotelDefaults: (patch: Partial<HotelDefaults>) => void;
  applyHotelDefaults: () => void;
  updateHotelRecord: (id: string, patch: Partial<Hotel>) => void;
  replaceHotelDatabase: (records: Hotel[]) => void;
  addHotelRecord: (hotel: Omit<Hotel, 'id' | 'lastUpdated'>) => void;
  deleteHotelRecord: (id: string) => void;
  resetHotelDatabase: () => void;
  setCostModel: (patch: Partial<CostModel>) => void;
  setTransport: (vehicle: string) => void;
  setCustomTransport: (vehicle: string) => void;
  addDayBlock: (day: number, block: Partial<Plan['dayPlans'][number]['blocks'][number]> & { name: string }) => void;
  removeDayBlock: (day: number, index: number) => void;
  reset: () => void;
  loadSavedItinerary: (id: string, snapshot: ItinerarySnapshot) => void;
  markSavedItinerary: (id: string) => void;
};

const defaultInput: TripInput = {
  name: '', arrival: '', departure: '', arrivalTime: '', departureTime: '', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000,
  hotelCategory: 'Signature', transport: 'Ertiga', mealPlan: 'Breakfast & Dinner', hotelOptionMode: 'single', style: 'Balanced', interests: ['Nature', 'Photography', 'Relaxation'],
};
const defaultCost: CostModel = { transportDaily: 4200, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {}, activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
const defaultHotelDefaults: HotelDefaults = { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 };
const STORAGE = 'chakar-experience-planner-v18-itinerary-controls';

function safeDatePlus(n: number) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function readState(): PlannerState {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const x = JSON.parse(raw);
      delete x.paymentPlan;
      return {
        ...x,
        packageQuotes: validPackageQuotes(x.packageQuotes) ? x.packageQuotes : undefined,
        routeVersion: typeof x.routeVersion === 'string' ? x.routeVersion : null,
        hotelDatabase: importedHotels,
        hotelDefaults: { ...defaultHotelDefaults, ...(x.hotelDefaults || {}) },
        costModel: { ...defaultCost, ...(x.costModel || {}), transportIsCustom: x.costModel?.transportIsCustom === true || (Boolean(x.input?.transport) && !transportOptions.includes(x.input.transport)), activityCosts: x.costModel?.activityCosts || {}, activitySelections: x.costModel?.activitySelections || {}, manualInclusions: Array.isArray(x.costModel?.manualInclusions) ? x.costModel.manualInclusions : [], manualExclusions: Array.isArray(x.costModel?.manualExclusions) ? x.costModel.manualExclusions : [] },
        input: { ...defaultInput, ...(x.input || {}), pickup: x.input?.pickup === 'Srinagar, Jammu' ? 'Srinagar' : (x.input?.pickup || defaultInput.pickup) },
        generated: Boolean(x.generated),
        savedItineraryId: typeof x.savedItineraryId === 'string' ? x.savedItineraryId : null,
      } as PlannerState;
    }
  } catch { /* fall back to clean state */ }
  return { input: { ...defaultInput, arrival: safeDatePlus(7), departure: safeDatePlus(14) }, plan: null, routeVersion: null, hotelSelections: [], hotelDatabase: importedHotels, costModel: { ...defaultCost }, hotelDefaults: { ...defaultHotelDefaults }, generated: false, savedItineraryId: null };
}

function selectionFromHotel(location: string, hotel: Hotel, nights: number, input: TripInput): HotelSelection {
  const rooms = roomsRequired(input.adults); const extraBeds = extraBedsRequired(input.youngAges); const cnb = cnbChildren(input.youngAges);
  return {
    location, hotelId: hotel.id, hotelName: hotel.name, category: hotel.normalizedCategory, starRating: hotel.starRating,
    address: hotel.address, roomType: hotel.roomType, website: hotel.website, nights, rooms, extraBeds, cnb,
    nightlyRate: hotel.mapB2B ?? 0, extraBedRate: hotel.extraBedB2B ?? 0, cnbRate: hotel.cnbB2B ?? 0,
    source: hotel.sourceType, rateConfirmed: false, status: !matchesPackageCategory(hotel,input.hotelCategory)
      ? `${hotel.normalizedCategory} alternative; confirm category${hotel.mapB2B ? '' : ' and rate'} before sharing`
      : hotel.mapB2B ? hotel.availabilityStatus : 'Hotel attached; B2B room rate is missing in supplied data',
  };
}

function selectionFallback(location: string, nights: number, input: TripInput, type: AccommodationType = 'hotel'): HotelSelection {
  const boat = type === 'houseboat';
  return {
    location, hotelId: '', hotelName: boat ? 'Houseboat to be added' : 'Hotel to be added', category: input.hotelCategory, starRating: null, address: '', roomType: '', website: '',
    nights, rooms: roomsRequired(input.adults), extraBeds: extraBedsRequired(input.youngAges), cnb: cnbChildren(input.youngAges),
    nightlyRate: 0, extraBedRate: 0, cnbRate: 0, source: boat ? 'No houseboat record' : 'No hotel record', status: `Add or attach a ${type} before confirmation`, rateConfirmed: false,
    ...(boat ? { accommodationType: type } : {}),
  };
}

function selectedProperty(hotel?: HotelSelection) {
  return hotel && (/^Custom (?:hotel|houseboat)$/i.test(hotel.source) || hotel.hotelId || (typeof hotel.hotelName === 'string' && hotel.hotelName.trim() &&
    !['Hotel to be added', 'Hotel to be confirmed', 'Houseboat to be added', 'Houseboat to be confirmed'].includes(hotel.hotelName)));
}

/** Keep chosen supplier quotes stable; suggest only the missing option slots. */
export function populateHotelOptions(plan: Plan, hotel: HotelSelection, db: Hotel[], input: TripInput): HotelSelection {
  if ((plan.input ? plan.input.hotelOptionMode : input.hotelOptionMode) !== 'multiple' || !hotel.nights || !selectedProperty(hotel)) return hotel;
  const cached = Array.isArray(hotel.alternatives) ? hotel.alternatives : [];
  const customCategory = hotelOptionCategory(hotel, db) || input.hotelCategory;
  const alternatives: HotelOptionQuote[] = [];
  for (const alternative of cached) {
    // Explicit custom slots, including unused placeholders, must keep their
    // positions and never be filled by a subsequent inventory refresh. Their
    // category is inherited from the primary; it is not an editable quote field.
    if (alternatives.length < 2 && (alternative.customId || (!sameHotelOption(hotel, alternative) && !alternatives.some((option) => sameHotelOption(option, alternative))))) {
      alternatives.push(alternative.customId && alternative.category !== customCategory ? { ...alternative, category: customCategory } : alternative);
    }
  }
  const days = plan.dayPlans.slice(0, plan.nights).filter((day, index) => hotel.nightNumbers === undefined || hotel.nightNumbers.includes(day.day || index + 1));
  const window = stayDateWindow(days, hotel.location);
  const retainCustomNames = allHotelOptionsCustom(hotel, 'multiple') && (hotel.sharedCustomRates || cached.length > 0);
  for (const candidate of retainCustomNames ? [] : hotelAlternativeCandidates(hotel, db, input.hotelCategory, window.arrival, window.departure)) {
    if (alternatives.length >= 2) break;
    const quote = hotelOptionFromSelection(selectionFromHotel(hotel.location, candidate, hotel.nights, input));
    if (!alternatives.some((option) => sameHotelOption(option, quote))) alternatives.push(quote);
  }
  if (JSON.stringify(cached) === JSON.stringify(alternatives)) return hotel;
  return { ...hotel, alternatives, rateConfirmed: false, confirmedSignature: undefined };
}

function syncProperty(plan: Plan, existing: HotelSelection | undefined, db: Hotel[], input: TripInput,
  location: string, nights: number, type: AccommodationType = 'hotel', nightNumbers?: number[]): HotelSelection {
  const allocation = nightNumbers === undefined ? {} : { accommodationType: type, nightNumbers };
  // Selected properties are quote snapshots. A different number or assignment
  // of nights must never reload a supplier's rate or replace a chosen property.
  if (selectedProperty(existing)) {
    const unchanged = existing!.nights === nights && JSON.stringify(existing!.nightNumbers) === JSON.stringify(nightNumbers);
    return populateHotelOptions(plan, unchanged ? existing! : { ...existing!, ...allocation, nights, rateConfirmed: false, confirmedSignature: undefined }, db, input);
  }
  // Do not attach a suggested property to an unused, cached accommodation type.
  if (!nights && existing) return { ...existing, ...allocation, nights: 0 };
  const days = (plan.dayPlans || []).slice(0, plan.nights || 0).filter((day, index) =>
    nightNumbers === undefined || nightNumbers.includes(day.day || index + 1));
  const window = stayDateWindow(days, location);
  const properties = location === 'Srinagar' ? db.filter((hotel) => isHouseboatHotel(hotel) === (type === 'houseboat')) : db;
  const candidate = suggestedHotel(location, input.hotelCategory, properties, window.arrival, window.departure);
  return populateHotelOptions(plan, {
    ...(candidate ? selectionFromHotel(location, candidate, nights, input) : selectionFallback(location, nights, input, type)),
    ...(existing?.alternatives ? { alternatives: existing.alternatives } : {}), ...allocation,
  }, db, input);
}

export function replaceHotelAlternativeInState(state: PlannerState, location: string, index: number, hotelId: string): PlannerState {
  if (!state.plan || state.plan.input.hotelOptionMode !== 'multiple' || !Number.isInteger(index) || index < 0 || index > 1) return state;
  const selections = syncHotelSelections(state.plan, state.hotelSelections, state.hotelDatabase, state.plan.input);
  const selected = selections.find((hotel) => hotelSelectionKey(hotel) === location);
  const record = state.hotelDatabase.find((hotel) => hotel.id === hotelId);
  if (!selected || !record) return state;
  const days = state.plan.dayPlans.slice(0, state.plan.nights).filter((day, dayIndex) => selected.nightNumbers === undefined || selected.nightNumbers.includes(day.day || dayIndex + 1));
  const window = stayDateWindow(days, selected.location);
  if (!hotelAlternativeCandidates(selected, state.hotelDatabase, state.plan.input.hotelCategory, window.arrival, window.departure).some((hotel) => hotel.id === hotelId)) return state;
  const quote = hotelOptionFromSelection(selectionFromHotel(selected.location, record, selected.nights, state.input));
  if (sameHotelOption(selected, quote) || (selected.alternatives || []).some((option, optionIndex) => optionIndex !== index && sameHotelOption(option, quote))) return state;
  const alternatives = [...(selected.alternatives || [])];
  while (index > alternatives.length) alternatives.push(blankCustomHotelAlternative(selected, state.plan.input, alternatives.length, state.hotelDatabase));
  alternatives[index] = quote;
  const replacement = withSharedCustomQuote(selected, { ...selected, alternatives }, state.plan.input);
  return { ...state, hotelSelections: selections.map((hotel) => hotel === selected ? { ...replacement, rateConfirmed: false, confirmedSignature: undefined } : hotel) };
}

/** Snapshot a shared quote only on entry; inventory refreshes never reprice it. */
function withSharedCustomQuote(previous: HotelSelection, next: HotelSelection, input: TripInput): HotelSelection {
  if (allHotelOptionsCustom(next, input.hotelOptionMode)) {
    const rates = sharedCustomHotelRates(previous, input.hotelOptionMode) || highestCompleteHotelRates(previous);
    return { ...next, sharedCustomRates: rates };
  }
  if (!next.sharedCustomRates) return next;
  const { sharedCustomRates: _shared, ...individual } = next;
  return individual;
}

/** Change only the primary property, retaining the other two supplier choices. */
export function useCustomHotelInState(state: PlannerState, location: string): PlannerState {
  const selections = state.plan ? syncHotelSelections(state.plan, state.hotelSelections, state.hotelDatabase, state.plan.input) : state.hotelSelections;
  const selected = selections.find((hotel) => hotelSelectionKey(hotel) === location);
  if (!selected || (!selected.hotelId && /^Custom (?:hotel|houseboat)$/i.test(selected.source))) return state;
  const type = hotelStayType(selected);
  const custom: HotelSelection = { ...selected, hotelId: '', hotelName: '', source: type === 'houseboat' ? 'Custom houseboat' : 'Custom hotel',
    address: '', website: '', roomType: type === 'houseboat' ? 'Houseboat' : '', starRating: null,
    rateConfirmed: false, confirmedSignature: undefined, status: 'user-edited' };
  const replacement = withSharedCustomQuote(selected, custom, state.plan?.input || state.input);
  return { ...state, hotelSelections: selections.map((hotel) => hotel === selected ? replacement : hotel) };
}

export function setSharedCustomHotelRateInState(state: PlannerState, location: string, field: keyof HotelRateBundle, value: number): PlannerState {
  if (!['nightlyRate', 'extraBedRate', 'cnbRate'].includes(field) || !Number.isFinite(value) || value < 0) return state;
  const selections = state.plan ? syncHotelSelections(state.plan, state.hotelSelections, state.hotelDatabase, state.plan.input) : state.hotelSelections;
  const selected = selections.find((hotel) => hotelSelectionKey(hotel) === location);
  const rates = selected && sharedCustomHotelRates(selected, state.plan?.input.hotelOptionMode || state.input.hotelOptionMode);
  if (!selected || !rates) return state;
  const replacement = { ...selected, sharedCustomRates: { ...rates, [field]: value }, rateConfirmed: false, confirmedSignature: undefined };
  return { ...state, hotelSelections: selections.map((hotel) => hotel === selected ? replacement : hotel) };
}

function blankCustomHotelAlternative(selected: HotelSelection, input: TripInput, index: number, database: Hotel[]): HotelOptionQuote {
  const type = hotelStayType(selected);
  return {
    customId: `custom-option-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    hotelId: '', hotelName: '', category: hotelOptionCategory(selected, database) || input.hotelCategory,
    starRating: null, address: '', roomType: type === 'houseboat' ? 'Houseboat' : '', website: '',
    nightlyRate: 0, extraBedRate: 0, cnbRate: 0, source: type === 'houseboat' ? 'Custom houseboat' : 'Custom hotel', status: 'user-edited',
  };
}

/** Enter an independent custom quote without creating or changing master data. */
export function setCustomHotelAlternativeInState(state: PlannerState, location: string, index: number,
  patch: Partial<Pick<HotelOptionQuote, 'hotelName' | 'nightlyRate' | 'extraBedRate' | 'cnbRate'>>): PlannerState {
  if (!state.plan || state.plan.input.hotelOptionMode !== 'multiple' || !Number.isInteger(index) || index < 0 || index > 1) return state;
  if (patch.hotelName !== undefined && typeof patch.hotelName !== 'string') return state;
  for (const field of ['nightlyRate', 'extraBedRate', 'cnbRate'] as const) {
    if (patch[field] !== undefined && (!Number.isFinite(patch[field]) || patch[field]! < 0)) return state;
  }
  const selections = syncHotelSelections(state.plan, state.hotelSelections, state.hotelDatabase, state.plan.input);
  const selected = selections.find((hotel) => hotelSelectionKey(hotel) === location);
  if (!selected) return state;
  const alternatives = [...(selected.alternatives || [])];
  while (alternatives.length <= index) alternatives.push(blankCustomHotelAlternative(selected, state.plan.input, alternatives.length, state.hotelDatabase));
  const current = alternatives[index];
  const custom = current.customId ? current : { ...blankCustomHotelAlternative(selected, state.plan.input, index, state.hotelDatabase),
    nightlyRate: current.nightlyRate, extraBedRate: current.extraBedRate, cnbRate: current.cnbRate };
  alternatives[index] = { ...custom, ...patch, status: 'user-edited' };
  const replacement = withSharedCustomQuote(selected, { ...selected, alternatives }, state.plan.input);
  const quoteUnchanged = hotelConfirmationSignature(state.plan, selected, state.input.mealPlan) === hotelConfirmationSignature(state.plan, replacement, state.input.mealPlan);
  return { ...state, hotelSelections: selections.map((hotel) => hotel === selected
    ? { ...replacement, ...(!quoteUnchanged ? { rateConfirmed: false, confirmedSignature: undefined } : {}) } : hotel) };
}

export function setHotelOptionRateInState(state: PlannerState, location: string, optionId: string, field: 'nightlyRate' | 'extraBedRate' | 'cnbRate', value: number): PlannerState {
  if (!Number.isFinite(value)) return state;
  const amount = Math.max(0, value);
  const selections = state.plan ? syncHotelSelections(state.plan, state.hotelSelections, state.hotelDatabase, state.plan.input) : state.hotelSelections;
  return { ...state, hotelSelections: selections.map((hotel) => {
    if (hotelSelectionKey(hotel) !== location) return hotel;
    if (hotelOptionIdentity(hotel) === optionId) return { ...hotel, [field]: amount, status: 'user-edited', rateConfirmed: false, confirmedSignature: undefined };
    if (!(hotel.alternatives || []).some((option) => hotelOptionIdentity(option) === optionId)) return hotel;
    return { ...hotel, alternatives: hotel.alternatives!.map((option) => hotelOptionIdentity(option) === optionId ? { ...option, [field]: amount, status: 'user-edited' } : option), rateConfirmed: false, confirmedSignature: undefined };
  }) };
}

/** A deliberate primary change may refresh its compatible options, never other stays. */
export function replaceHotelInState(state: PlannerState, location: string, hotelId: string): PlannerState {
  const record = state.hotelDatabase.find((hotel) => hotel.id === hotelId);
  if (!record) return state;
  const selections = state.plan ? syncHotelSelections(state.plan, state.hotelSelections, state.hotelDatabase, state.plan.input) : state.hotelSelections;
  const selected = selections.find((hotel) => hotelSelectionKey(hotel) === location);
  if (!selected || !sameHotelDestination(record.destination, selected.location) || isHouseboatHotel(record) !== (hotelStayType(selected) === 'houseboat')) return state;
  const fresh: HotelSelection = { ...selectionFromHotel(selected.location, record, selected.nights, state.input),
    rooms: selected.rooms, extraBeds: selected.extraBeds, cnb: selected.cnb,
    ...(selected.accommodationType ? { accommodationType: selected.accommodationType } : {}),
    ...(selected.nightNumbers !== undefined ? { accommodationType: hotelStayType(selected), nightNumbers: selected.nightNumbers } : {}) };
  const days = state.plan?.dayPlans.slice(0, state.plan.nights).filter((day, index) => selected.nightNumbers === undefined || selected.nightNumbers.includes(day.day || index + 1)) || [];
  const window = stayDateWindow(days, selected.location);
  const allowed = new Set(hotelAlternativeCandidates(fresh, state.hotelDatabase, state.input.hotelCategory, window.arrival, window.departure).map((hotel) => hotel.id));
  fresh.alternatives = (selected.alternatives || []).filter((option) => option.customId || (allowed.has(option.hotelId) && option.nightlyRate >= fresh.nightlyRate * 0.7 && option.nightlyRate <= fresh.nightlyRate * 1.3));
  const replacement = state.plan ? populateHotelOptions(state.plan, fresh, state.hotelDatabase, state.plan.input) : fresh;
  return { ...state, hotelSelections: selections.map((hotel) => hotel === selected ? replacement : hotel) };
}

export function syncHotelSelections(plan: Plan, current: HotelSelection[], db: Hotel[], input: TripInput) {
  return plan.hotelPlans.flatMap((row) => {
    const existing = current.find((hotel) => hotel.location === row.location && (row.location !== 'Srinagar' || hotelStayType(hotel) === 'hotel'));
    const boat = row.location === 'Srinagar' ? current.find((hotel) => hotel.location === row.location && hotelStayType(hotel) === 'houseboat') : undefined;
    if (!boat) return [syncProperty(plan, existing, db, input, row.location, row.nights)];
    const available = plan.dayPlans.slice(0, plan.nights).flatMap((day, index) => day.stay === row.location ? [day.day || index + 1] : []);
    const count = Math.min(available.length, Math.max(0, Math.round(boat.nights) || 0));
    // Keep chosen houseboat nights where the revised route still stays in
    // Srinagar. If one moves to another destination, retain the houseboat
    // quantity on another Srinagar night. New extra nights default to a hotel.
    const preferred = boat.nightNumbers === undefined ? available : boat.nightNumbers;
    const boatNights = [...new Set(preferred)].filter((night) => available.includes(night)).slice(0, count);
    for (const night of available) if (boatNights.length < count && !boatNights.includes(night)) boatNights.push(night);
    boatNights.sort((a, b) => a - b);
    const hotelNights = available.filter((night) => !boatNights.includes(night));
    const selections: HotelSelection[] = [];
    if (existing || hotelNights.length) selections.push(syncProperty(plan, existing, db, input, row.location, hotelNights.length, 'hotel', hotelNights));
    selections.push(syncProperty(plan, boat, db, input, row.location, boatNights.length, 'houseboat', boatNights));
    return selections;
  });
}

/** Assign only Srinagar's actual overnight dates; hotels take the remainder. */
export function setSrinagarHouseboatNights(state: PlannerState, nightNumbers: number[]): PlannerState {
  if (!state.plan) return state;
  const plan = state.plan;
  const available = plan.dayPlans.slice(0, plan.nights).flatMap((day, index) => day.stay === 'Srinagar' ? [day.day || index + 1] : []);
  if (!Array.isArray(nightNumbers) || new Set(nightNumbers).size !== nightNumbers.length ||
    nightNumbers.some((night) => !Number.isInteger(night) || !available.includes(night))) {
    throw new Error('Choose each houseboat night from the Srinagar overnight dates.');
  }
  const current = syncHotelSelections(plan, state.hotelSelections, state.hotelDatabase, plan.input);
  const boat = current.find((hotel) => hotel.location === 'Srinagar' && hotelStayType(hotel) === 'houseboat');
  if (!available.length || (!boat && !nightNumbers.length)) return state;
  const hotel = current.find((item) => item.location === 'Srinagar' && hotelStayType(item) === 'hotel');
  const boatNights = [...nightNumbers].sort((a, b) => a - b);
  const hotelNights = available.filter((night) => !boatNights.includes(night));
  const stays = current.filter((item) => item.location !== 'Srinagar');
  if (hotel || hotelNights.length) {
    stays.push(syncProperty(plan, hotel, state.hotelDatabase, plan.input, 'Srinagar', hotelNights.length, 'hotel', hotelNights));
  }
  stays.push(syncProperty(plan, boat, state.hotelDatabase, plan.input, 'Srinagar', boatNights.length, 'houseboat', boatNights));
  return stateWithScheduledPlan({ ...state, hotelSelections: stays }, plan);
}

/** Match every comparison package to the shared overnight allocation. */
export function syncPackageQuotes(state: PlannerState, previousPlan: Plan | null = state.plan): PlannerState {
  const plan = state.plan;
  if (!plan) return state;
  const categories = packageCategories(plan.input);
  if (categories.length === 1 && !state.packageQuotes) return state;
  const quotes: Record<string, PackageQuote> = { ...state.packageQuotes };
  delete quotes[plan.input.hotelCategory];
  for (const category of categories.filter((item) => item !== plan.input.hotelCategory)) {
    const cached = state.packageQuotes?.[category];
    const input = { ...plan.input, hotelCategory: category, packagePreferences: [category] };
    const scopedPlan = { ...plan, input };
    const aligned = state.hotelSelections.map((shared) => {
      const existing = cached?.hotelSelections.find((hotel) => hotelSelectionKey(hotel) === hotelSelectionKey(shared));
      return { ...(existing || { ...shared, hotelId: '', hotelName: '', category, source: '', alternatives: undefined, sharedCustomRates: undefined, rateConfirmed: false, confirmedSignature: undefined }),
        nights: shared.nights, accommodationType: hotelStayType(shared), nightNumbers: shared.nightNumbers };
    });
    const hotels = syncHotelSelections(scopedPlan, aligned, state.hotelDatabase, input).map((hotel) => {
      const stillConfirmed = previousPlan && previousPlan.input.adults === plan.input.adults &&
        JSON.stringify(previousPlan.input.youngAges) === JSON.stringify(plan.input.youngAges) &&
        hotel.confirmedSignature === hotelConfirmationSignature(scopedPlan, hotel, input.mealPlan);
      return hotel.rateConfirmed && !stillConfirmed ? { ...hotel, rateConfirmed: false, confirmedSignature: undefined } : hotel;
    });
    quotes[category] = { ...cached, hotelSelections: hotels,
      costOverrides: cached?.costOverrides || { profitPct: state.costModel.profitPct, otherAmount: state.costModel.otherAmount } };
  }
  return { ...state, packageQuotes: quotes };
}

/** Mutations operate on one package without leaking negotiated rates to another. */
export function updatePackageInState(state: PlannerState, category: string, update: (state: PlannerState) => PlannerState): PlannerState {
  if (!state.plan || !packageCategories(state.plan.input).includes(category)) return state;
  const current = syncPackageQuotes(state);
  const primary = current.plan!.input.hotelCategory;
  if (category === primary) return syncPackageQuotes(update(current));
  const scoped = packageView(current, category);
  const changed = update(scoped);
  const previous = current.packageQuotes![category];
  const costOverrides = { ...previous.costOverrides };
  for (const field of ['profitPct', 'otherAmount', 'transportDaily', 'transportIsCustom'] as const) {
    if (changed.costModel[field] !== scoped.costModel[field]) Object.assign(costOverrides, { [field]: changed.costModel[field] });
  }
  const transportChanged = changed.input.transport !== scoped.input.transport || changed.costModel.transportDaily !== scoped.costModel.transportDaily;
  return { ...current, packageQuotes: { ...current.packageQuotes,
    [category]: { ...previous, hotelSelections: changed.hotelSelections, costOverrides,
      ...(transportChanged ? { transport: changed.input.transport } : {}) } } };
}

/** Changing the primary preference must promote its existing quote, not reprice it. */
function promotePackage(state: PlannerState, category: string): PlannerState {
  if (!state.plan || state.plan.input.hotelCategory === category || !state.packageQuotes?.[category]) return state;
  const target = packageView(state, category);
  const snapshots: Record<string, PackageQuote> = { ...state.packageQuotes };
  // Pin inherited vehicles only if the promoted package changes the default.
  // Reordering equal defaults must not silently create optional vehicles.
  const defaultChanged = target.input.transport !== state.input.transport ||
    target.costModel.transportDaily !== state.costModel.transportDaily ||
    Boolean(target.costModel.transportIsCustom) !== Boolean(state.costModel.transportIsCustom);
  for (const previousCategory of packageCategories(state.plan.input)) {
    const previous = packageView(state, previousCategory);
    const pinTransport = defaultChanged || state.packageQuotes?.[previousCategory]?.transport !== undefined;
    snapshots[previousCategory] = { hotelSelections: previous.hotelSelections,
      ...(pinTransport ? { transport: previous.input.transport } : {}),
      costOverrides: { profitPct: previous.costModel.profitPct, otherAmount: previous.costModel.otherAmount,
        ...(pinTransport ? { transportDaily: previous.costModel.transportDaily, transportIsCustom: previous.costModel.transportIsCustom } : {}) } };
  }
  delete snapshots[category];
  return { ...state, hotelSelections: target.hotelSelections, costModel: target.costModel, packageQuotes: snapshots,
    // Compare the promoted quote with its own previous category and dates.
    // A different position in the comparison is not a changed supplier quote.
    plan: { ...state.plan, input: { ...state.plan.input, hotelCategory: category, transport: target.input.transport } },
    input: { ...state.input, transport: target.input.transport } };
}

function stateWithScheduledPlan(state: PlannerState, plan: Plan | null): PlannerState {
  if (!plan) return { ...state, plan };
  const previousPlan = state.plan;
  const hotelSelections = syncHotelSelections(plan, state.hotelSelections, state.hotelDatabase, plan.input).map((hotel) => {
    const existing = state.hotelSelections.find((item) => hotelSelectionKey(item) === hotelSelectionKey(hotel));
    if (existing && previousPlan) {
      const unchanged = existing.nights === hotel.nights && previousPlan.input.mealPlan === plan.input.mealPlan && previousPlan.input.hotelCategory === plan.input.hotelCategory &&
        (previousPlan.input.hotelOptionMode || 'single') === (plan.input.hotelOptionMode || 'single') &&
        previousPlan.input.adults === plan.input.adults && JSON.stringify(previousPlan.input.youngAges) === JSON.stringify(plan.input.youngAges) &&
        JSON.stringify(hotelNightDates(previousPlan, existing)) === JSON.stringify(hotelNightDates(plan, hotel));
      // Only the affected accommodation's changed stay dates need verification.
      return unchanged ? hotel : { ...hotel, rateConfirmed: false, confirmedSignature: undefined };
    }
    return hotel;
  });
  return syncPackageQuotes({ ...state, plan, hotelSelections, costModel: activityQuoteForPlan(state.costModel, plan) }, previousPlan);
}

function activityQuoteForPlan(model: CostModel, plan: Plan): CostModel {
  const remaining = tripActivityDestinations(plan);
  const retained = (key: string) => remaining.has(key.split('\u001f')[0]);
  const costs = Object.entries(model.activityCosts || {}).filter(([key]) => retained(key));
  const selections = Object.entries(model.activitySelections || {}).filter(([key]) => retained(key));
  if (model.activityCosts && model.activitySelections && costs.length === Object.keys(model.activityCosts).length && selections.length === Object.keys(model.activitySelections).length) return model;
  return { ...model, activityCosts: Object.fromEntries(costs), activitySelections: Object.fromEntries(selections) };
}

/** Apply a journey edit without replacing its hotels, negotiated rates or vehicle. */
export function applyPlanEdit(state: PlannerState, plan: Plan): PlannerState {
  const costModel = activityQuoteForPlan(state.costModel, plan);
  return stateWithScheduledPlan({ ...state, costModel }, reschedulePlan(plan, costModel));
}

/** Next updates an existing client trip; Build New alone starts another quote. */
export function generatePlannerState(state: PlannerState, overrides: Partial<TripInput> = {}, replanDestinations = false): PlannerState {
  const effectiveInput = validatedTripInput({ ...state.input, ...overrides });
  const previousCategory = state.plan?.input.hotelCategory;
  state = promotePackage(state, effectiveInput.hotelCategory);
  // A promoted package retains its optional vehicle when it becomes primary.
  if (previousCategory && previousCategory !== effectiveInput.hotelCategory) effectiveInput.transport = state.input.transport;
  const plan = state.plan && !replanDestinations ? editTripPlan(state.plan, effectiveInput) : createPlan(effectiveInput);
  const costModel = state.plan ? state.costModel : { ...state.costModel,
    transportDaily: state.costModel.transportIsCustom ? state.costModel.transportDaily : (transportRates[effectiveInput.transport] ?? state.costModel.transportDaily) };
  const routeVersion = !state.plan || replanDestinations || state.plan.nights !== plan.nights ? ROUTE_VERSION : state.routeVersion;
  return applyPlanEdit({ ...state, input: effectiveInput, routeVersion, costModel,
    hotelDefaults: state.plan ? state.hotelDefaults : { ...state.hotelDefaults, rooms: roomsRequired(effectiveInput.adults), extraBeds: extraBedsRequired(effectiveInput.youngAges), cnb: cnbChildren(effectiveInput.youngAges) }, generated: true }, plan);
}

/** Keep the route and hotel quote together when restoring or normalising a draft. */
export function reconcilePlannerState(state: PlannerState): PlannerState {
  return state.plan ? applyPlanEdit(state, state.plan) : state;
}

const Ctx = createContext<PlannerContextValue | null>(null);
export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlannerState>(() => ({ input: { ...defaultInput }, plan: null, routeVersion: null, hotelSelections: [], hotelDatabase: importedHotels, costModel: { ...defaultCost }, hotelDefaults: { ...defaultHotelDefaults }, generated: false, savedItineraryId: null }));
  const [mounted, setMounted] = useState(false);
  const [destinationCatalog,setDestinationCatalog]=useState<Destination[]>([...destinations]);
  const [destinationConnection,setDestinationConnection]=useState<'loading'|'ready'|'error'>('loading');
  const [destinationConnectionError,setDestinationConnectionError]=useState('');
  const destinationRequest=useRef(0);
  const [packageDefaults,setPackageDefaults]=useState<PackageDefaults>(initialPackageDefaults);
  const [packageDefaultsConnection,setPackageDefaultsConnection]=useState<'loading'|'ready'|'error'>('loading');
  const [packageDefaultsError,setPackageDefaultsError]=useState('');
  const packageDefaultsRequest=useRef(0);
  const [hotelConnection,setHotelConnection]=useState<'loading'|'ready'|'error'|'signed-out'>('loading');
  const [hotelConnectionError,setHotelConnectionError]=useState('');
  const hotelRequest=useRef(0);
  async function refreshPackageDefaults() {
    const request=++packageDefaultsRequest.current;
    setPackageDefaultsConnection('loading'); setPackageDefaultsError('');
    try {
      const response=await fetch('/api/package-defaults',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Package defaults request failed (${response.status}).`);
      const defaults=validatePackageDefaults(payload.packageDefaults);
      if(request!==packageDefaultsRequest.current)return;
      setPackageDefaults(defaults); setPackageDefaultsConnection('ready');
    } catch(error) {
      if(request!==packageDefaultsRequest.current)return;
      // Preserve the last confirmed list while a refresh fails. Consumers use
      // connection status to avoid saving or publishing an unconfirmed value.
      setPackageDefaultsConnection('error');
      setPackageDefaultsError(error instanceof Error?error.message:'Could not load package defaults.');
    }
  }
  async function updatePackageDefaults(next: PackageDefaults) {
    const defaults=validatePackageDefaults(next);
    const request=++packageDefaultsRequest.current;
    setPackageDefaultsConnection('loading'); setPackageDefaultsError('');
    try {
      const response=await fetch('/api/package-defaults',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(defaults),signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Could not save package defaults (${response.status}).`);
      const saved=validatePackageDefaults(payload.packageDefaults);
      if(request!==packageDefaultsRequest.current)return;
      setPackageDefaults(saved); setPackageDefaultsConnection('ready');
    } catch(error) {
      if(request===packageDefaultsRequest.current){
        setPackageDefaultsConnection('error');
        setPackageDefaultsError(error instanceof Error?error.message:'Could not save package defaults.');
      }
      throw error;
    }
  }
  async function refreshDestinations(rebuildCurrent = false) {
    const request=++destinationRequest.current;
    setDestinationConnection('loading'); setDestinationConnectionError('');
    try {
      const response=await fetch('/api/destinations',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Destination database request failed (${response.status}).`);
      if(!Array.isArray(payload.destinations))throw new Error('Destination database returned an invalid response.');
      // A slower read must never replace a newer saved/refreshed catalogue.
      if(request!==destinationRequest.current)return false;
      const catalog=payload.destinations as Destination[];
      replaceArchivedDestinationCatalog(Array.isArray(payload.archivedDestinations) ? payload.archivedDestinations : []);
      replaceDestinationCatalog(catalog);
      setDestinationCatalog([...destinations]);
      setState((current) => {
        if (!current.plan) return current;
        try {
          if (!rebuildCurrent) return reconcilePlannerState(current);
          const sequence = current.plan.dayPlans.slice(0, current.plan.nights).map((day) => day.stay);
          const plan = rebuildPlanFromNightSequence(current.plan, sequence);
          return applyPlanEdit(current, plan);
        } catch { return current; }
      });
      setDestinationConnection('ready');
      return true;
    } catch(error) {
      if(request!==destinationRequest.current)return false;
      setDestinationConnection('error');
      setDestinationConnectionError(error instanceof Error?error.message:'Could not load destination database.');
      // Initial loads and Retry are intentionally non-throwing. Save callers
      // inspect this result before claiming success or navigating away.
      return false;
    }
  }
  async function refreshHotels(){
    const request=++hotelRequest.current;
    setHotelConnection('loading'); setHotelConnectionError('');
    try {
      const response=await fetch('/api/hotels',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(response.status===401){
        const login=new URL('/login',window.location.origin);
        login.searchParams.set('next',window.location.pathname+window.location.search);
        window.location.replace(login.toString());
        throw new Error('Admin session expired. Sign in to load hotel suggestions.');
      }
      if(!response.ok)throw new Error(payload.error||`Hotel database request failed (${response.status}).`);
      if(!payload.configured)throw new Error('Hotel database is not configured on this deployment.');
      if(!Array.isArray(payload.hotels))throw new Error('Hotel database returned an invalid response.');
      const db=payload.hotels as Hotel[];
      if(!db.length)throw new Error('The hotel master is empty. Import hotel records in the admin dashboard.');
      if(request!==hotelRequest.current)return;
      setState((s)=>({...s,hotelDatabase:db,hotelSelections:s.plan?syncHotelSelections(s.plan,s.hotelSelections,db,s.input):s.hotelSelections}));
      setHotelConnection('ready');
    } catch(error){
      if(request!==hotelRequest.current)return;
      const message=error instanceof Error?error.message:'Could not load hotel database.';
      setHotelConnection(message.includes('session expired')?'signed-out':'error');
      setHotelConnectionError(message);
    }
  }
  useEffect(() => {
    // Retain restored day-trip content until active and removed guides load.
    setState(readState());
    setMounted(true);
    // Login is public and has no session yet. The full navigation after sign-in
    // remounts this provider and loads the hotel master with the new cookie.
    if(window.location.pathname!=='/login') { void refreshHotels(); void refreshDestinations(); void refreshPackageDefaults(); }
  }, []);
  const scheduledPlan = useMemo(() => state.plan ? destinationConnection === 'ready' ? reschedulePlan(state.plan, state.costModel) : state.plan : null,
    [state.plan, state.costModel.activityCosts, state.costModel.activitySelections, destinationCatalog, destinationConnection]);
  const scheduledState = useMemo(() => stateWithScheduledPlan(state, scheduledPlan), [state, scheduledPlan]);
  useEffect(() => { if (mounted) { try { const {hotelDatabase: _privateRates, ...saved}=scheduledState; localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { /* ignore storage errors */ } } }, [scheduledState, mounted]);
  const value = useMemo<PlannerContextValue>(() => ({
    ...scheduledState,
    hydrated: mounted,
    destinationCatalog,
    destinationConnection,
    destinationConnectionError,
    refreshDestinations,
    removeDestinationFromLibrary(destination) {
      ++destinationRequest.current;
      const id = destination.id || destination.name;
      replaceArchivedDestinationCatalog([...archivedDestinationCatalog().filter((item) => (item.id || item.name) !== id), destination]);
      replaceDestinationCatalog(destinations.filter((item) => (item.id || item.name) !== id));
      setDestinationCatalog([...destinations]);
      setState((current) => reconcilePlannerState(current));
    },
    packageDefaults,
    packageDefaultsConnection,
    packageDefaultsError,
    refreshPackageDefaults,
    updatePackageDefaults,
    hotelConnection,
    hotelConnectionError,
    refreshHotels,
    setInputField(key, value) { setState((s) => {
      if (key === 'packagePreferences') {
        const categories = packageCategories({ hotelCategory: s.input.hotelCategory, packagePreferences: value as string[] });
        return { ...s, input: { ...s.input, packagePreferences: categories, hotelCategory: categories[0] } };
      }
      if (key === 'hotelCategory') return { ...s, input: { ...s.input, hotelCategory: value as string, packagePreferences: [value as string] } };
      return { ...s, input: { ...s.input, [key]: value } };
    }); },
    updatePackageState(category, update) { setState((s) => updatePackageInState(s, category, update)); },
    setPackageTransport(category, vehicle, custom = false) {
      setState((s) => {
        if (!s.plan || category === s.plan.input.hotelCategory || !packageCategories(s.plan.input).includes(category)) return s;
        const current = syncPackageQuotes(s);
        const quote = current.packageQuotes![category];
        const costOverrides = { ...quote.costOverrides };
        if (vehicle === null) {
          delete costOverrides.transportDaily; delete costOverrides.transportIsCustom;
          const { transport: _transport, ...rest } = quote;
          return { ...current, packageQuotes: { ...current.packageQuotes, [category]: { ...rest, costOverrides } } };
        }
        if (vehicle.length > 80) return s;
        costOverrides.transportIsCustom = custom;
        costOverrides.transportDaily = custom ? (quote.costOverrides?.transportIsCustom ? quote.costOverrides.transportDaily : 0) : transportRates[vehicle] ?? s.costModel.transportDaily;
        return { ...current, packageQuotes: { ...current.packageQuotes, [category]: { ...quote, transport: vehicle, costOverrides } } };
      });
    },
    setPackageTransportRate(category, rate) {
      if (!Number.isFinite(rate) || rate < 0) return;
      setState((s) => updatePackageInState(s, category, (scoped) => ({ ...scoped, costModel: { ...scoped.costModel, transportDaily: rate } })));
    },
    setYoungAges(ages) { setState((s) => ({ ...s, input: { ...s.input, youngAges: ages } })); },
    setInterests(xs) { setState((s) => ({ ...s, input: { ...s.input, interests: xs } })); },
    generate(overrides = {}) {
      setState(generatePlannerState(state, overrides));
    },
    replanDestinations() {
      setState((current) => generatePlannerState(current, {}, true));
    },
    setDayDestination(day, destination) {
      setState((s) => {
        if (!s.plan) return s;
        try {
          const nextPlan = retargetDay(reschedulePlan(s.plan, s.costModel), day, destination);
          // A destination change must refresh the auto-generated title/about copy.
          // Any operator custom copy for that day is intentionally cleared so the
          // destination's own intelligence description becomes the new baseline.
          nextPlan.dayPlans = nextPlan.dayPlans.map((d) => d.day === day ? { ...d, customTitle: undefined, customAbout: undefined } : d);
          return applyPlanEdit(s, nextPlan);
        } catch {
          return s;
        }
      });
    },
    setDayTrip(day, destination) {
      setState((s) => {
        if (!s.plan) return s;
        try {
          const current = reconcilePlannerState(s);
          const plan = setPlanDayTrip(current.plan!, day, destination);
          return applyPlanEdit(current, plan);
        }
        catch { return s; }
      });
    },
    setDeparturePoint(destination) {
      setState((s) => {
        if (!s.plan) return s;
        try {
          const current = reconcilePlannerState(s);
          const plan = setPlanDeparturePoint(current.plan!, destination);
          return applyPlanEdit(current, plan);
        }
        catch { return s; }
      });
    },
    setDayContent(day, patch) {
      setState((s) => {
        if (!s.plan) return s;
        const plan = reschedulePlan(s.plan, s.costModel);
        return { ...s, plan: { ...plan, dayPlans: plan.dayPlans.map((d) => d.day === day ? { ...d, customTitle: patch.title ?? d.customTitle, customAbout: patch.about ?? d.customAbout, customAboutContext: patch.about !== undefined ? withPlanDestinations(plan, () => dayScheduleContext(d)) : d.customAboutContext } : d) } };
      });
    },
    setStayAllocation(entries) {
      setState((s) => {
        if (!s.plan) return s;
        const clean = entries.filter((x) => x && x.location && Number.isFinite(x.nights) && x.nights > 0).map((x) => ({ location: x.location, nights: Math.round(x.nights) }));
        const total = clean.reduce((sum, x) => sum + x.nights, 0);
        if (total !== s.plan.nights) return s;
        const seen = new Set<string>();
        const sequence: string[] = [];
        for (const row of clean) {
          if (seen.has(row.location)) return s;
          const destination = destinationByName(row.location);
          if (!destination || !destination.overnight_allowed) return s;
          seen.add(row.location);
          for (let i = 0; i < row.nights; i++) sequence.push(row.location);
        }
        try {
          const nextPlan = rebuildPlanFromNightSequence(reschedulePlan(s.plan, s.costModel), sequence);
          return applyPlanEdit(s, nextPlan);
        } catch { return s; }
      });
    },
    setNightSequence(sequence) {
      setState((s) => {
        if (!s.plan || sequence.length !== s.plan.nights) return s;
        if (sequence.some((name) => { const d = destinationByName(name); return !d || !d.overnight_allowed; })) return s;
        try {
          const nextPlan = rebuildPlanFromNightSequence(reschedulePlan(s.plan, s.costModel), sequence);
          return applyPlanEdit(s, nextPlan);
        } catch { return s; }
      });
    },
    setSrinagarHouseboatNights(nightNumbers) {
      setState((s) => setSrinagarHouseboatNights(s, nightNumbers));
    },
    addDay() {
      setState((s) => {
        if (!s.plan || s.plan.nights >= 30) return s;
        try {
          const departure = departureForNights(s.input.arrival, s.plan.nights + 1);
          if (!departure) return s;
          return generatePlannerState(s, { departure });
        } catch { return s; }
      });
    },
    removeDay(day) {
      setState((s) => {
        if (!s.plan || s.plan.nights <= 1 || day < 1 || day > s.plan.days) return s;
        try {
          const nextPlan = removeTripDay(reschedulePlan(s.plan, s.costModel), day);
          return applyPlanEdit({ ...s, input: nextPlan.input }, nextPlan);
        } catch { return s; }
      });
    },
    replaceHotel(location, hotelId) {
      setState((s) => replaceHotelInState(s, location, hotelId));
    },
    useCustomHotel(location) {
      setState((s) => useCustomHotelInState(s, location));
    },
    replaceHotelAlternative(location, index, hotelId) {
      setState((s) => replaceHotelAlternativeInState(s, location, index, hotelId));
    },
    setCustomHotelAlternative(location, index, patch) {
      setState((s) => setCustomHotelAlternativeInState(s, location, index, patch));
    },
    setHotelOptionRate(location, hotelId, field, value) {
      setState((s) => setHotelOptionRateInState(s, location, hotelId, field, value));
    },
    setSharedCustomHotelRate(location, field, value) {
      setState((s) => setSharedCustomHotelRateInState(s, location, field, value));
    },
    setHotelRate(location, field, value) {
      setState((s) => {
        const selections = s.plan ? syncHotelSelections(s.plan, s.hotelSelections, s.hotelDatabase, s.plan.input) : s.hotelSelections;
        return { ...s, hotelSelections: selections.map((h) => hotelSelectionKey(h) === location ? { ...h, [field]: Math.max(0, value), status: 'user-edited', rateConfirmed: false, confirmedSignature: undefined } : h) };
      });
    },
    setHotelMeta(location, patch) {
      setState((s) => {
        const current = s.plan ? syncHotelSelections(s.plan, s.hotelSelections, s.hotelDatabase, s.plan.input) : s.hotelSelections;
        const selections = current.map((h) => hotelSelectionKey(h) === location
          ? { ...h, ...patch, accommodationType: hotelStayType(h), rateConfirmed: typeof patch.rateConfirmed === 'boolean' ? patch.rateConfirmed : false,
            confirmedSignature: typeof patch.rateConfirmed === 'boolean' ? patch.confirmedSignature : undefined } : h);
        return { ...s, hotelSelections: s.plan ? syncHotelSelections(s.plan, selections, s.hotelDatabase, s.plan.input) : selections };
      });
    },
    setHotelDefaults(patch) { setState((s) => ({ ...s, hotelDefaults: { ...s.hotelDefaults, ...patch } })); },
    applyHotelDefaults() { setState((s) => ({ ...s, hotelSelections: s.hotelSelections.map((h) => ({ ...h, rooms: s.hotelDefaults.rooms, extraBeds: s.hotelDefaults.extraBeds, cnb: s.hotelDefaults.cnb, nightlyRate: s.hotelDefaults.nightlyRate || h.nightlyRate, extraBedRate: s.hotelDefaults.extraBedRate || h.extraBedRate, cnbRate: s.hotelDefaults.cnbRate || h.cnbRate, status: 'common hotel policy applied', rateConfirmed: false })) })); },
    updateHotelRecord(id, patch) {
      setState((s) => {
        const hotelDatabase = s.hotelDatabase.map((h) => h.id === id ? { ...h, ...patch, lastUpdated: new Date().toISOString().slice(0, 10) } : h);
        const hotelSelections = s.plan ? syncHotelSelections(s.plan, s.hotelSelections, hotelDatabase, s.input) : s.hotelSelections;
        return { ...s, hotelDatabase, hotelSelections };
      });
    },
    replaceHotelDatabase(records) {
      setState((s) => {
        const clean = records.filter((r) => r && r.id && r.destination && r.name);
        const hotelSelections = s.plan ? syncHotelSelections(s.plan, s.hotelSelections, clean, s.input) : s.hotelSelections;
        return { ...s, hotelDatabase: clean, hotelSelections };
      });
    },
    addHotelRecord(hotel) {
      setState((s) => {
        const id = `hotel-custom-${Date.now()}`;
        return { ...s, hotelDatabase: [...s.hotelDatabase, { ...hotel, id, lastUpdated: new Date().toISOString().slice(0, 10) }] };
      });
    },
    deleteHotelRecord(id) {
      setState((s) => ({ ...s, hotelDatabase: s.hotelDatabase.filter((h) => h.id !== id), hotelSelections: s.hotelSelections.map((h) => h.hotelId === id ? { ...h, status: 'Hotel record removed; reselect before confirmation' } : h) }));
    },
    resetHotelDatabase() {
      setState((s) => ({ ...s, hotelDatabase: importedHotels, hotelSelections: s.plan ? syncHotelSelections(s.plan, s.hotelSelections, importedHotels, s.input) : s.hotelSelections }));
    },
    setCostModel(patch) { setState((s) => ({ ...s, costModel: { ...s.costModel, ...patch } })); },
    setTransport(vehicle) {
      setState((s) => ({
        ...s,
        input: { ...s.input, transport: vehicle },
        plan: s.plan ? { ...s.plan, input: { ...s.plan.input, transport: vehicle } } : null,
        costModel: { ...s.costModel, transportIsCustom: false, transportDaily: transportRates[vehicle] ?? s.costModel.transportDaily },
      }));
    },
    setCustomTransport(vehicle) {
      setState((s) => ({
        ...s,
        input: { ...s.input, transport: vehicle },
        plan: s.plan ? { ...s.plan, input: { ...s.plan.input, transport: vehicle } } : null,
        costModel: { ...s.costModel, transportIsCustom: true, transportDaily: s.costModel.transportIsCustom ? s.costModel.transportDaily : 0 },
      }));
    },
    addDayBlock(day, block) {
      setState((s) => {
        if (!s.plan) return s;
        return { ...s, plan: { ...s.plan, dayPlans: s.plan.dayPlans.map((d) => d.day === day ? { ...d, blocks: [...d.blocks, {
          name: block.name,
          description: block.description || 'Added from the Kashmir destination library.',
          reason: block.reason || 'Added by the trip planner.',
          tags: block.tags || ['custom'],
          source: block.source,
          conditional: block.conditional,
          kind: block.kind || 'custom',
        }] } : d) } };
      });
    },
    removeDayBlock(day, index) {
      setState((s) => s.plan ? { ...s, plan: { ...s.plan, dayPlans: s.plan.dayPlans.map((d) => d.day === day ? { ...d, blocks: d.blocks.filter((_, i) => i !== index) } : d) } } : s);
    },
    reset() { try { localStorage.removeItem(STORAGE); } catch {} location.href = '/'; },
    loadSavedItinerary(id, snapshot) {
      setState((s) => reconcilePlannerState({ ...s, ...snapshot, packageQuotes: validPackageQuotes(snapshot.packageQuotes) ? snapshot.packageQuotes : undefined, costModel: { ...defaultCost, ...snapshot.costModel, activitySelections: snapshot.costModel?.activitySelections || {}, manualInclusions: Array.isArray(snapshot.costModel?.manualInclusions) ? snapshot.costModel.manualInclusions : [], manualExclusions: Array.isArray(snapshot.costModel?.manualExclusions) ? snapshot.costModel.manualExclusions : [], transportIsCustom: snapshot.costModel?.transportIsCustom === true || (Boolean(snapshot.input?.transport) && !transportOptions.includes(snapshot.input.transport)) }, hotelDatabase: s.hotelDatabase, savedItineraryId: id }));
    },
    markSavedItinerary(id) { setState((s) => ({ ...s, savedItineraryId: id })); },
  }), [state, scheduledState, mounted, hotelConnection, hotelConnectionError, destinationCatalog, destinationConnection, destinationConnectionError, packageDefaults, packageDefaultsConnection, packageDefaultsError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanner() { const v = useContext(Ctx); if (!v) throw new Error('usePlanner must be used inside PlannerProvider'); return v; }

/** Reuse the established editors with mutations directed to just this quote. */
export function PackagePlanner({ category, children }: { category: string; children: ReactNode }) {
  const base = usePlanner();
  const scoped = packageView(base, category);
  const update = (change: (state: PlannerState) => PlannerState) => base.updatePackageState(category, change);
  const value: PlannerContextValue = { ...scoped,
    replaceHotel: (location, hotelId) => update((s) => replaceHotelInState(s, location, hotelId)),
    useCustomHotel: (location) => update((s) => useCustomHotelInState(s, location)),
    replaceHotelAlternative: (location, index, hotelId) => update((s) => replaceHotelAlternativeInState(s, location, index, hotelId)),
    setCustomHotelAlternative: (location, index, patch) => update((s) => setCustomHotelAlternativeInState(s, location, index, patch)),
    setHotelOptionRate: (location, optionId, field, amount) => update((s) => setHotelOptionRateInState(s, location, optionId, field, amount)),
    setSharedCustomHotelRate: (location, field, amount) => update((s) => setSharedCustomHotelRateInState(s, location, field, amount)),
    setHotelRate(location, field, amount) {
      if (!Number.isFinite(amount)) return;
      update((s) => ({ ...s, hotelSelections: s.hotelSelections.map((hotel) => hotelSelectionKey(hotel) === location ?
        { ...hotel, [field]: Math.max(0, amount), status: 'user-edited', rateConfirmed: false, confirmedSignature: undefined } : hotel) }));
    },
    setHotelMeta(location, patch) {
      update((s) => ({ ...s, hotelSelections: s.hotelSelections.map((hotel) => hotelSelectionKey(hotel) === location ?
        { ...hotel, ...patch, accommodationType: hotelStayType(hotel), rateConfirmed: typeof patch.rateConfirmed === 'boolean' ? patch.rateConfirmed : false,
          confirmedSignature: typeof patch.rateConfirmed === 'boolean' ? patch.confirmedSignature : undefined } : hotel) }));
    },
    applyHotelDefaults() {
      update((s) => ({ ...s, hotelSelections: s.hotelSelections.map((hotel) => ({ ...hotel,
        rooms: s.hotelDefaults.rooms, extraBeds: s.hotelDefaults.extraBeds, cnb: s.hotelDefaults.cnb,
        nightlyRate: s.hotelDefaults.nightlyRate || hotel.nightlyRate, extraBedRate: s.hotelDefaults.extraBedRate || hotel.extraBedRate,
        cnbRate: s.hotelDefaults.cnbRate || hotel.cnbRate, rateConfirmed: false, confirmedSignature: undefined })) }));
    },
    setCostModel: (patch) => update((s) => ({ ...s, costModel: { ...s.costModel, ...patch } })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
const transportRates: Record<string, number> = { Sedan: 3400, Ertiga: 4200, Innova: 5200, 'Tempo Traveller': 7600 };
void hotelCategories; void mealOptions; void travelStyles; void interests; void firstHotelCandidate;
