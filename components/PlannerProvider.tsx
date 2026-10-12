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

export type HotelSelection = {
  location: string; hotelId: string; hotelName: string; category: string; starRating: number | null; address: string; roomType: string; website: string;
  nights: number; rooms: number; extraBeds: number; cnb: number; nightlyRate: number; extraBedRate: number; cnbRate: number; source: string; status: string; rateConfirmed?: boolean; confirmedSignature?: string;
  accommodationType?: AccommodationType; nightNumbers?: number[];
};
export type CostModel = { transportDaily: number; transportIsCustom: boolean; mealPerPersonNight: number; activityBudget: number; activityCosts: Record<string, number>; activitySelections: Record<string, boolean>; manualInclusions: string[]; manualExclusions: string[]; contingencyPct: number; profitPct: number; otherAmount: number };
export type HotelDefaults = { rooms: number; extraBeds: number; cnb: number; nightlyRate: number; extraBedRate: number; cnbRate: number };
export type PlannerState = { input: TripInput; plan: Plan | null; routeVersion: string | null; hotelSelections: HotelSelection[]; hotelDatabase: Hotel[]; costModel: CostModel; hotelDefaults: HotelDefaults; generated: boolean; savedItineraryId: string | null };
export type ItinerarySnapshot = Omit<PlannerState, 'hotelDatabase' | 'savedItineraryId'>;
export function itinerarySnapshot(state: PlannerState): ItinerarySnapshot {
  return { input: state.input, plan: state.plan, routeVersion: state.routeVersion, hotelSelections: state.hotelSelections, costModel: state.costModel, hotelDefaults: state.hotelDefaults, generated: state.generated };
}

type PlannerContextValue = PlannerState & {
  hydrated: boolean;
  destinationCatalog: Destination[];
  destinationConnection: 'loading' | 'ready' | 'error';
  destinationConnectionError: string;
  refreshDestinations: (rebuildCurrent?: boolean) => Promise<void>;
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
  hotelCategory: 'Signature', transport: 'Ertiga', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature', 'Photography', 'Relaxation'],
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
  return hotel && (hotel.hotelId || (typeof hotel.hotelName === 'string' && hotel.hotelName.trim() &&
    !['Hotel to be added', 'Hotel to be confirmed', 'Houseboat to be added', 'Houseboat to be confirmed'].includes(hotel.hotelName)));
}

function syncProperty(plan: Plan, existing: HotelSelection | undefined, db: Hotel[], input: TripInput,
  location: string, nights: number, type: AccommodationType = 'hotel', nightNumbers?: number[]): HotelSelection {
  const allocation = nightNumbers === undefined ? {} : { accommodationType: type, nightNumbers };
  // Selected properties are quote snapshots. A different number or assignment
  // of nights must never reload a supplier's rate or replace a chosen property.
  if (selectedProperty(existing)) {
    const unchanged = existing!.nights === nights && JSON.stringify(existing!.nightNumbers) === JSON.stringify(nightNumbers);
    return unchanged ? existing! : { ...existing!, ...allocation, nights, rateConfirmed: false, confirmedSignature: undefined };
  }
  // Do not attach a suggested property to an unused, cached accommodation type.
  if (!nights && existing) return { ...existing, ...allocation, nights: 0 };
  const days = (plan.dayPlans || []).slice(0, plan.nights || 0).filter((day, index) =>
    nightNumbers === undefined || nightNumbers.includes(day.day || index + 1));
  const window = stayDateWindow(days, location);
  const properties = location === 'Srinagar' ? db.filter((hotel) => isHouseboatHotel(hotel) === (type === 'houseboat')) : db;
  const candidate = suggestedHotel(location, input.hotelCategory, properties, window.arrival, window.departure);
  return { ...(candidate ? selectionFromHotel(location, candidate, nights, input) : selectionFallback(location, nights, input, type)), ...allocation };
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

function stateWithScheduledPlan(state: PlannerState, plan: Plan | null): PlannerState {
  if (!plan) return { ...state, plan };
  const previousPlan = state.plan;
  const hotelSelections = syncHotelSelections(plan, state.hotelSelections, state.hotelDatabase, plan.input).map((hotel) => {
    const existing = state.hotelSelections.find((item) => hotelSelectionKey(item) === hotelSelectionKey(hotel));
    if (existing && previousPlan) {
      const unchanged = existing.nights === hotel.nights && previousPlan.input.mealPlan === plan.input.mealPlan && previousPlan.input.hotelCategory === plan.input.hotelCategory &&
        previousPlan.input.adults === plan.input.adults && JSON.stringify(previousPlan.input.youngAges) === JSON.stringify(plan.input.youngAges) &&
        JSON.stringify(hotelNightDates(previousPlan, existing)) === JSON.stringify(hotelNightDates(plan, hotel));
      // Only the affected accommodation's changed stay dates need verification.
      return unchanged ? hotel : { ...hotel, rateConfirmed: false, confirmedSignature: undefined };
    }
    return hotel;
  });
  return { ...state, plan, hotelSelections, costModel: activityQuoteForPlan(state.costModel, plan) };
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
export function generatePlannerState(state: PlannerState, overrides: Partial<TripInput> = {}): PlannerState {
  const effectiveInput = validatedTripInput({ ...state.input, ...overrides });
  const plan = state.plan ? editTripPlan(state.plan, effectiveInput) : createPlan(effectiveInput);
  const costModel = state.plan ? state.costModel : { ...state.costModel,
    transportDaily: state.costModel.transportIsCustom ? state.costModel.transportDaily : (transportRates[effectiveInput.transport] ?? state.costModel.transportDaily) };
  return applyPlanEdit({ ...state, input: effectiveInput, routeVersion: ROUTE_VERSION, costModel,
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
    setDestinationConnection('loading'); setDestinationConnectionError('');
    try {
      const response=await fetch('/api/destinations',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Destination database request failed (${response.status}).`);
      if(!Array.isArray(payload.destinations))throw new Error('Destination database returned an invalid response.');
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
    } catch(error) {
      setDestinationConnection('error');
      setDestinationConnectionError(error instanceof Error?error.message:'Could not load destination database.');
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
    setInputField(key, value) { setState((s) => ({ ...s, input: { ...s.input, [key]: value } })); },
    setYoungAges(ages) { setState((s) => ({ ...s, input: { ...s.input, youngAges: ages } })); },
    setInterests(xs) { setState((s) => ({ ...s, input: { ...s.input, interests: xs } })); },
    generate(overrides = {}) {
      setState(generatePlannerState(state, overrides));
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
      setState((s) => {
        const rec = s.hotelDatabase.find((h) => h.id === hotelId); if (!rec) return s;
        const selected = s.hotelSelections.find((hotel) => hotelSelectionKey(hotel) === location);
        if (!selected || !sameHotelDestination(rec.destination, selected.location) ||
          (selected.location === 'Srinagar' && isHouseboatHotel(rec) !== (hotelStayType(selected) === 'houseboat'))) return s;
        return { ...s, hotelSelections: s.hotelSelections.map((hotel) => hotelSelectionKey(hotel) === location
          ? { ...selectionFromHotel(hotel.location, rec, hotel.nights, s.input),
            ...(hotel.accommodationType ? { accommodationType: hotel.accommodationType } : {}),
            ...(hotel.nightNumbers !== undefined ? { accommodationType: hotelStayType(hotel), nightNumbers: hotel.nightNumbers } : {}) } : hotel) };
      });
    },
    setHotelRate(location, field, value) {
      setState((s) => ({ ...s, hotelSelections: s.hotelSelections.map((h) => hotelSelectionKey(h) === location ? { ...h, [field]: Math.max(0, value), status: 'user-edited', rateConfirmed: false } : h) }));
    },
    setHotelMeta(location, patch) {
      setState((s) => ({ ...s, hotelSelections: s.hotelSelections.map((h) => hotelSelectionKey(h) === location
        ? { ...h, ...patch, accommodationType: hotelStayType(h), rateConfirmed: typeof patch.rateConfirmed === 'boolean' ? patch.rateConfirmed : false } : h) }));
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
      setState((s) => reconcilePlannerState({ ...s, ...snapshot, costModel: { ...defaultCost, ...snapshot.costModel, activitySelections: snapshot.costModel?.activitySelections || {}, manualInclusions: Array.isArray(snapshot.costModel?.manualInclusions) ? snapshot.costModel.manualInclusions : [], manualExclusions: Array.isArray(snapshot.costModel?.manualExclusions) ? snapshot.costModel.manualExclusions : [], transportIsCustom: snapshot.costModel?.transportIsCustom === true || (Boolean(snapshot.input?.transport) && !transportOptions.includes(snapshot.input.transport)) }, hotelDatabase: s.hotelDatabase, savedItineraryId: id }));
    },
    markSavedItinerary(id) { setState((s) => ({ ...s, savedItineraryId: id })); },
  }), [state, scheduledState, mounted, hotelConnection, hotelConnectionError, destinationCatalog, destinationConnection, destinationConnectionError, packageDefaults, packageDefaultsConnection, packageDefaultsError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanner() { const v = useContext(Ctx); if (!v) throw new Error('usePlanner must be used inside PlannerProvider'); return v; }
const transportRates: Record<string, number> = { Sedan: 3400, Ertiga: 4200, Innova: 5200, 'Tempo Traveller': 7600 };
void hotelCategories; void mealOptions; void travelStyles; void interests; void firstHotelCandidate;
