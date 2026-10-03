'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPlan, retargetDay, rebuildPlanFromNightSequence, setPlanDayTrip, setPlanDeparturePoint, ROUTE_VERSION, type Plan, type TripInput } from '@/lib/itinerary';
import { hotelDatabase as importedHotels, hotelCategories, mealOptions, transportOptions, travelStyles, interests, destinations, destinationByName, replaceDestinationCatalog, type Destination, type Hotel } from '@/lib/data';
import { firstHotelCandidate, roomsRequired, cnbChildren, extraBedsRequired, matchesPackageCategory, suggestedHotel } from '@/lib/hotels';

export type HotelSelection = {
  location: string; hotelId: string; hotelName: string; category: string; starRating: number | null; address: string; roomType: string; website: string;
  nights: number; rooms: number; extraBeds: number; cnb: number; nightlyRate: number; extraBedRate: number; cnbRate: number; source: string; status: string;
};
export type CostModel = { transportDaily: number; mealPerPersonNight: number; activityBudget: number; contingencyPct: number; profitPct: number; otherAmount: number };
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
  refreshDestinations: () => Promise<void>;
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
  addDayBlock: (day: number, block: Partial<Plan['dayPlans'][number]['blocks'][number]> & { name: string }) => void;
  removeDayBlock: (day: number, index: number) => void;
  reset: () => void;
  loadSavedItinerary: (id: string, snapshot: ItinerarySnapshot) => void;
  markSavedItinerary: (id: string) => void;
};

const defaultInput: TripInput = {
  name: '', arrival: '', departure: '', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000,
  hotelCategory: 'Signature', transport: 'Ertiga', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature', 'Photography', 'Relaxation'],
};
const defaultCost: CostModel = { transportDaily: 4200, mealPerPersonNight: 0, activityBudget: 0, contingencyPct: 0, profitPct: 10, otherAmount: 0 };
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
        costModel: { ...defaultCost, ...(x.costModel || {}) },
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
    source: hotel.sourceType, status: !matchesPackageCategory(hotel,input.hotelCategory)
      ? `${hotel.normalizedCategory} alternative; confirm category${hotel.mapB2B ? '' : ' and rate'} before sharing`
      : hotel.mapB2B ? hotel.availabilityStatus : 'Hotel attached; B2B room rate is missing in supplied data',
  };
}

function selectionFallback(location: string, nights: number, input: TripInput, db: Hotel[]): HotelSelection {
  const candidate = suggestedHotel(location, input.hotelCategory, db);
  if (candidate) return selectionFromHotel(location, candidate, nights, input);
  return {
    location, hotelId: '', hotelName: 'Hotel to be added', category: input.hotelCategory, starRating: null, address: '', roomType: '', website: '',
    nights, rooms: roomsRequired(input.adults), extraBeds: extraBedsRequired(input.youngAges), cnb: cnbChildren(input.youngAges),
    nightlyRate: 0, extraBedRate: 0, cnbRate: 0, source: 'No hotel record', status: 'Add or attach a hotel before confirmation',
  };
}

export function syncHotelSelections(plan: Plan, current: HotelSelection[], db: Hotel[], input: TripInput) {
  return plan.hotelPlans.map((row) => {
    const existing = current.find((h) => h.location === row.location);
    const existingRecord = existing?.hotelId ? db.find((h) => h.id === existing.hotelId) : null;
    if (existing && existingRecord) {
      const refreshed=selectionFromHotel(row.location,existingRecord,row.nights,input);
      return existing.status==='user-edited'?{...refreshed,nightlyRate:existing.nightlyRate,extraBedRate:existing.extraBedRate,cnbRate:existing.cnbRate,status:existing.status}:refreshed;
    }
    if (existing?.hotelId) return { ...existing, nights: row.nights, status: 'Selected hotel is not in the current database; verify this stay' };
    if (existing && existing.hotelName && existing.hotelName !== 'Hotel to be added' && existing.hotelName !== 'Hotel to be confirmed') return { ...existing, nights: row.nights };
    const candidate = suggestedHotel(row.location, input.hotelCategory, db);
    return candidate ? selectionFromHotel(row.location, candidate, row.nights, input) : selectionFallback(row.location, row.nights, input, db);
  });
}

function shiftDate(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10);
}

const Ctx = createContext<PlannerContextValue | null>(null);
export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlannerState>(() => ({ input: { ...defaultInput }, plan: null, routeVersion: null, hotelSelections: [], hotelDatabase: importedHotels, costModel: { ...defaultCost }, hotelDefaults: { ...defaultHotelDefaults }, generated: false, savedItineraryId: null }));
  const [mounted, setMounted] = useState(false);
  const [destinationCatalog,setDestinationCatalog]=useState<Destination[]>([...destinations]);
  const [destinationConnection,setDestinationConnection]=useState<'loading'|'ready'|'error'>('loading');
  const [destinationConnectionError,setDestinationConnectionError]=useState('');
  const [hotelConnection,setHotelConnection]=useState<'loading'|'ready'|'error'|'signed-out'>('loading');
  const [hotelConnectionError,setHotelConnectionError]=useState('');
  const hotelRequest=useRef(0);
  async function refreshDestinations() {
    setDestinationConnection('loading'); setDestinationConnectionError('');
    try {
      const response=await fetch('/api/destinations',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Destination database request failed (${response.status}).`);
      if(!Array.isArray(payload.destinations))throw new Error('Destination database returned an invalid response.');
      const catalog=payload.destinations as Destination[];
      replaceDestinationCatalog(catalog);
      setDestinationCatalog([...catalog]);
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
    setState(readState());
    setMounted(true);
    // Login is public and has no session yet. The full navigation after sign-in
    // remounts this provider and loads the hotel master with the new cookie.
    if(window.location.pathname!=='/login') { void refreshHotels(); void refreshDestinations(); }
  }, []);
  useEffect(() => { if (mounted) { try { const {hotelDatabase: _privateRates, ...saved}=state; localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { /* ignore storage errors */ } } }, [state, mounted]);

  const value = useMemo<PlannerContextValue>(() => ({
    ...state,
    hydrated: mounted,
    destinationCatalog,
    destinationConnection,
    destinationConnectionError,
    refreshDestinations,
    hotelConnection,
    hotelConnectionError,
    refreshHotels,
    setInputField(key, value) { setState((s) => ({ ...s, input: { ...s.input, [key]: value } })); },
    setYoungAges(ages) { setState((s) => ({ ...s, input: { ...s.input, youngAges: ages } })); },
    setInterests(xs) { setState((s) => ({ ...s, input: { ...s.input, interests: xs } })); },
    generate(overrides = {}) {
      const effectiveInput = { ...state.input, ...overrides };
      const plan = createPlan(effectiveInput);
      const selections = syncHotelSelections(plan, [], state.hotelDatabase, effectiveInput);
      setState((s) => ({ ...s, input: effectiveInput, plan, routeVersion: ROUTE_VERSION, hotelSelections: selections, hotelDefaults: { ...s.hotelDefaults, rooms: roomsRequired(effectiveInput.adults), extraBeds: extraBedsRequired(effectiveInput.youngAges), cnb: cnbChildren(effectiveInput.youngAges) }, costModel: { ...s.costModel, transportDaily: transportRates[effectiveInput.transport] ?? s.costModel.transportDaily }, generated: true }));
    },
    setDayDestination(day, destination) {
      setState((s) => {
        if (!s.plan) return s;
        try {
          const nextPlan = retargetDay(s.plan, day, destination);
          // A destination change must refresh the auto-generated title/about copy.
          // Any operator custom copy for that day is intentionally cleared so the
          // destination's own intelligence description becomes the new baseline.
          nextPlan.dayPlans = nextPlan.dayPlans.map((d) => d.day === day ? { ...d, customTitle: undefined, customAbout: undefined } : d);
          const nextHotels = syncHotelSelections(nextPlan, s.hotelSelections, s.hotelDatabase, s.input);
          return { ...s, plan: nextPlan, hotelSelections: nextHotels };
        } catch {
          return s;
        }
      });
    },
    setDayTrip(day, destination) {
      setState((s) => {
        if (!s.plan) return s;
        try { return { ...s, plan: setPlanDayTrip(s.plan, day, destination) }; }
        catch { return s; }
      });
    },
    setDeparturePoint(destination) {
      setState((s) => {
        if (!s.plan) return s;
        try { return { ...s, plan: setPlanDeparturePoint(s.plan, destination) }; }
        catch { return s; }
      });
    },
    setDayContent(day, patch) {
      setState((s) => s.plan ? { ...s, plan: { ...s.plan, dayPlans: s.plan.dayPlans.map((d) => d.day === day ? { ...d, customTitle: patch.title ?? d.customTitle, customAbout: patch.about ?? d.customAbout } : d) } } : s);
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
          const nextPlan = rebuildPlanFromNightSequence(s.plan, sequence);
          const nextHotels = syncHotelSelections(nextPlan, s.hotelSelections, s.hotelDatabase, s.input);
          return { ...s, plan: nextPlan, hotelSelections: nextHotels };
        } catch { return s; }
      });
    },
    setNightSequence(sequence) {
      setState((s) => {
        if (!s.plan || sequence.length !== s.plan.nights) return s;
        if (sequence.some((name) => { const d = destinationByName(name); return !d || !d.overnight_allowed; })) return s;
        try {
          const nextPlan = rebuildPlanFromNightSequence(s.plan, sequence);
          const nextHotels = syncHotelSelections(nextPlan, s.hotelSelections, s.hotelDatabase, s.input);
          return { ...s, plan: nextPlan, hotelSelections: nextHotels };
        } catch { return s; }
      });
    },
    addDay() {
      setState((s) => {
        if (!s.plan || s.plan.nights >= 30) return s;
        const lastStay = s.plan.dayPlans[s.plan.nights - 1]?.stay || 'Srinagar';
        const sequence = s.plan.dayPlans.slice(0, s.plan.nights).map((d) => d.stay);
        sequence.push(lastStay);
        try {
          const nextPlan = rebuildPlanFromNightSequence(s.plan, sequence);
          const nextInput = { ...s.input, departure: shiftDate(s.input.departure, 1) };
          nextPlan.input = nextInput;
          const nextHotels = syncHotelSelections(nextPlan, s.hotelSelections, s.hotelDatabase, nextInput);
          return { ...s, input: nextInput, plan: nextPlan, hotelSelections: nextHotels };
        } catch { return s; }
      });
    },
    removeDay(day) {
      setState((s) => {
        if (!s.plan || s.plan.nights <= 1 || day < 1 || day > s.plan.days) return s;
        const sequence = s.plan.dayPlans.slice(0, s.plan.nights).map((d) => d.stay);
        const removeIndex = day >= s.plan.days ? sequence.length - 1 : Math.min(sequence.length - 1, day - 1);
        sequence.splice(removeIndex, 1);
        try {
          const nextPlan = rebuildPlanFromNightSequence(s.plan, sequence);
          const nextInput = { ...s.input, departure: shiftDate(s.input.departure, -1) };
          nextPlan.input = nextInput;
          const nextHotels = syncHotelSelections(nextPlan, s.hotelSelections, s.hotelDatabase, nextInput);
          return { ...s, input: nextInput, plan: nextPlan, hotelSelections: nextHotels };
        } catch { return s; }
      });
    },
    replaceHotel(location, hotelId) {
      setState((s) => {
        const rec = s.hotelDatabase.find((h) => h.id === hotelId); if (!rec) return s;
        return { ...s, hotelSelections: s.hotelSelections.map((h) => h.location === location ? selectionFromHotel(location, rec, h.nights, s.input) : h) };
      });
    },
    setHotelRate(location, field, value) {
      setState((s) => ({ ...s, hotelSelections: s.hotelSelections.map((h) => h.location === location ? { ...h, [field]: Math.max(0, value), status: 'user-edited' } : h) }));
    },
    setHotelMeta(location, patch) {
      setState((s) => ({ ...s, hotelSelections: s.hotelSelections.map((h) => h.location === location ? { ...h, ...patch } : h) }));
    },
    setHotelDefaults(patch) { setState((s) => ({ ...s, hotelDefaults: { ...s.hotelDefaults, ...patch } })); },
    applyHotelDefaults() { setState((s) => ({ ...s, hotelSelections: s.hotelSelections.map((h) => ({ ...h, rooms: s.hotelDefaults.rooms, extraBeds: s.hotelDefaults.extraBeds, cnb: s.hotelDefaults.cnb, nightlyRate: s.hotelDefaults.nightlyRate || h.nightlyRate, extraBedRate: s.hotelDefaults.extraBedRate || h.extraBedRate, cnbRate: s.hotelDefaults.cnbRate || h.cnbRate, status: 'common hotel policy applied' })) })); },
    updateHotelRecord(id, patch) {
      setState((s) => {
        const hotelDatabase = s.hotelDatabase.map((h) => h.id === id ? { ...h, ...patch, lastUpdated: new Date().toISOString().slice(0, 10) } : h);
        const changed = hotelDatabase.find((h) => h.id === id);
        const hotelSelections = changed ? s.hotelSelections.map((h) => h.hotelId === id ? selectionFromHotel(h.location, changed, h.nights, s.input) : h) : s.hotelSelections;
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
        costModel: { ...s.costModel, transportDaily: transportRates[vehicle] ?? s.costModel.transportDaily },
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
      setState((s) => ({ ...s, ...snapshot, hotelDatabase: s.hotelDatabase, savedItineraryId: id }));
    },
    markSavedItinerary(id) { setState((s) => ({ ...s, savedItineraryId: id })); },
  }), [state, mounted, hotelConnection, hotelConnectionError, destinationCatalog, destinationConnection, destinationConnectionError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanner() { const v = useContext(Ctx); if (!v) throw new Error('usePlanner must be used inside PlannerProvider'); return v; }
const transportRates: Record<string, number> = { Sedan: 3400, Ertiga: 4200, Innova: 5200, 'Tempo Traveller': 7600 };
void hotelCategories; void mealOptions; void transportOptions; void travelStyles; void interests; void firstHotelCandidate;
