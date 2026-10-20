'use client';
import { savedHotelMaster } from '@/lib/saved-plan-data';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Hotel as HotelIcon, Minus, Plus, Search, Ship, X } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { PackagePlanner, usePlanner, type HotelSelection } from '@/components/PlannerProvider';
import { isHouseboatHotel, matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';
import { hotelConfirmationSummary } from '@/lib/hotel-confirmation';
import { activeHotelSelections, hotelNightNumbers, hotelSelectionKey, hotelStayType, hotelStayWindow } from '@/lib/accommodation';
import { allHotelOptionsCustom, sharedCustomHotelRates, effectiveHotelSelection, hotelAlternativeCandidates, hotelOptionIdentity, hotelOptionNightlyCost, hotelOptions, isUnusedHotelOption, type HotelOptionQuote } from '@/lib/hotel-options';
import { packageCategories } from '@/lib/package-quotes';
import './houseboat-stays.css';
import './hotel-options.css';
import '@/components/package-comparison.css';
import './hotel-compact.css';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }
function displayDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function needsStayName(name: string) { const value = (name || '').trim(); return !value || ['Hotel to be added', 'Hotel to be confirmed', 'Houseboat to be added', 'Houseboat to be confirmed'].includes(value); }

function RateInput({ label, displayLabel, value, onChange, onCommit, minimum = 0 }: { label: string; displayLabel?: string; value: number; onChange?: (next: number) => void; onCommit?: (next: number) => void; minimum?: number }) {
  const [text, setText] = useState(value > 0 ? String(Math.round(value)) : '');
  const [focused, setFocused] = useState(false);
  const commit = useRef(onCommit);
  useEffect(() => { if (!focused) setText(value > 0 ? String(Math.round(value)) : ''); }, [value, focused]);
  return <label className="stay-rate-field"><span>{displayLabel || label}</span><div><b>₹</b><input aria-label={label} type="number" min={minimum} value={text} placeholder="0" onFocus={() => { setFocused(true); commit.current = onCommit; }} onChange={(event) => { const next = event.target.value; setText(next); if (!onCommit) onChange?.(next === '' ? 0 : Math.max(0, Number(next) || 0)); }} onBlur={() => { const next = text === '' ? 0 : Math.max(0, Number(text) || 0); if (next >= minimum) commit.current?.(next); setFocused(false); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></div></label>;
}

function CountInput({ label, displayLabel, value, min, onChange }: { label: string; displayLabel?: string; value: number; min: number; onChange: (next: number) => void }) {
  return <div className="stay-count-field"><span>{displayLabel || label}</span><div><button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14}/></button><strong>{value}</strong><button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}><Plus size={14}/></button></div></div>;
}

function HotelPackageSummary({ category }: { category: string }) {
  const { plan, hotelSelections } = usePlanner();
  const stays = plan ? activeHotelSelections(plan, hotelSelections) : [];
  const total = stays.reduce((sum, stay) => sum + hotelNightNumbers(plan!, stay).length * hotelOptionNightlyCost(effectiveHotelSelection(stay, plan!.input.hotelOptionMode), stay), 0);
  return <summary className="package-comparison-summary"><span className="package-comparison-identity"><span className="package-comparison-icon"><HotelIcon size={19}/></span><span><strong>{category}</strong><small>{stays.length} accommodation stay{stays.length === 1 ? '' : 's'}</small></span></span><span className="package-comparison-value"><span><strong>{money(total)}</strong><small>Accommodation</small></span><ChevronRight size={18}/></span></summary>;
}

function HotelFinalConfirmation() {
  const planner = usePlanner();
  const { complete, confirmed, count, packages, problems } = hotelConfirmationSummary(planner);
  const canConfirm = planner.hotelConnection === 'ready' && complete;
  return <section className={`hotel-all-confirm${confirmed ? ' is-confirmed' : ''}`} aria-label="Final hotel confirmation">
    <div><h2>{confirmed ? 'Hotels confirmed' : 'Confirm hotel rates'}</h2><p>{count} stay{count === 1 ? '' : 's'}{packages.length > 1 ? ` across ${packages.length} packages` : ''} · {complete ? 'Rates filled in. Edit only if needed.' : 'Complete the missing details below.'}</p>
      {problems.length > 0 && <ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
    </div>
    <label><input type="checkbox" checked={confirmed} disabled={!canConfirm} onChange={(event) => { if (!event.target.checked || canConfirm) planner.confirmHotelRates(event.target.checked); }}/><span>Rates and availability confirmed for all stays</span></label>
  </section>;
}

function HotelComparison() {
  const { plan, hotelSelections, hotelConnection, hotelConnectionError, refreshHotels, setSrinagarHouseboatNights } = usePlanner();
  if (!plan) return null;
  const categories = packageCategories(plan.input);
  const srinagarNights = plan.dayPlans.slice(0, plan.nights).filter((day) => sameHotelDestination(day.stay, 'Srinagar'));
  const boatNights = new Set(activeHotelSelections(plan, hotelSelections).filter((stay) => sameHotelDestination(stay.location, 'Srinagar') && hotelStayType(stay) === 'houseboat').flatMap((stay) => hotelNightNumbers(plan, stay)));
  function toggleBoatNight(night: number) {
    const next = new Set(boatNights);
    if (next.has(night)) next.delete(night); else next.add(night);
    setSrinagarHouseboatNights([...next].sort((a, b) => a - b));
  }
  return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="hotel-workspace">
    {hotelConnection !== 'ready' && <div className={`hotel-connection ${hotelConnection}`} role="status"><div><b>{hotelConnection === 'loading' ? 'Loading hotel suggestions…' : 'Hotel database needs attention'}</b><span>{hotelConnectionError || 'Checking the hotel database.'}</span></div>{hotelConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshHotels()}>Retry</button>}</div>}
    {srinagarNights.length > 0 && <details className="package-shared-stay"><summary><span><Ship size={17}/><strong>Srinagar hotel &amp; houseboat nights</strong></span><span>{boatNights.size ? `${boatNights.size} houseboat night${boatNights.size === 1 ? '' : 's'}` : 'Optional houseboat'}<ChevronRight size={16}/></span></summary><div className="package-shared-stay-body"><p>Choose the houseboat nights once for every package. Select each package’s property and rate below.</p><div className="houseboat-night-options" role="group" aria-label="Shared Srinagar houseboat nights">{srinagarNights.map((night) => <button type="button" key={night.day} aria-label={`Houseboat for night ${night.day}, ${displayDate(night.date)}`} aria-pressed={boatNights.has(night.day)} onClick={() => toggleBoatNight(night.day)}><span>Night {night.day}</span><strong>{displayDate(night.date)}</strong>{boatNights.has(night.day) && <Ship size={14}/>}</button>)}</div><div className="houseboat-allocation"><span>{srinagarNights.length - boatNights.size} hotel nights · {boatNights.size} houseboat nights</span>{boatNights.size > 0 && <button type="button" className="simple-text-button" onClick={() => setSrinagarHouseboatNights([])}>Use hotels for all nights</button>}</div></div></details>}
    <div className="package-comparison-list">{categories.map((category, index) => <details className="package-comparison-panel" key={category} open={index === 0}><PackagePlanner category={category}><HotelPackageSummary category={category}/><HotelPackageEditor/></PackagePlanner></details>)}</div>
    <HotelFinalConfirmation/>
    <div className="next-row"><Link className="secondary-link" href="/planner/destinations"><ChevronLeft size={16}/> Back to destinations</Link><div><b>Packages ready?</b><span>Transport and activities are next.</span></div><Link className="primary-cta inline" href="/planner/activities-transport">Next: Activities &amp; Transport <ChevronRight size={16}/></Link></div>
  </div></PlannerChrome></AppShell>;
}

export default function HotelsPage() { return useHotelPackageEditor(false); }

function HotelPackageEditor() { return useHotelPackageEditor(true); }

function useHotelPackageEditor(embedded: boolean) {
  const { plan, input, hotelSelections, replaceHotel, replaceHotelAlternative, useCustomHotel, setCustomHotelAlternative, setSharedCustomHotelRate, setHotelRate, setHotelOptionRate, setHotelMeta, setSrinagarHouseboatNights, hotelDatabase, hotelConnection, hotelConnectionError, refreshHotels, hydrated } = usePlanner();
  const db = plan ? savedHotelMaster(plan, hotelDatabase) : hotelDatabase;
  const [editing, setEditing] = useState<string | null>(null);
  const [hotelSearch, setHotelSearch] = useState<Record<string, string>>({});
  const [houseboatOpen, setHouseboatOpen] = useState(false);
  const [rateReview, setRateReview] = useState<{ stayKey: string; optionId?: string; alternativeIndex?: number } | null>(null);

  if (!hydrated) { const loading = <div className="empty-panel"><HotelIcon size={28}/><h2>Loading hotel stays…</h2></div>; return embedded ? loading : <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS">{loading}</PlannerChrome></AppShell>; }
  if (!plan) { const empty = <div className="empty-panel"><HotelIcon size={28}/><h2>Choose your destinations first</h2><Link className="primary-cta inline" href="/planner/destinations">Choose destinations <ChevronRight size={16}/></Link></div>; return embedded ? empty : <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS">{empty}</PlannerChrome></AppShell>; }
  if (!embedded && packageCategories(plan.input).length > 1) return <HotelComparison/>;

  const selected = activeHotelSelections(plan, hotelSelections);
  const optionMode = plan.input.hotelOptionMode || 'single';
  const multipleOptions = optionMode === 'multiple';
  const srinagarNights = plan.dayPlans.slice(0, plan.nights).filter((day) => sameHotelDestination(day.stay, 'Srinagar'));
  const houseboatNightNumbers = selected.filter((hotel) => sameHotelDestination(hotel.location, 'Srinagar') && hotelStayType(hotel) === 'houseboat').flatMap((hotel) => hotelNightNumbers(plan, hotel));
  const houseboatNights = new Set(houseboatNightNumbers);
  const hotelNightsCount = srinagarNights.length - houseboatNights.size;
  const houseboat = selected.find((hotel) => sameHotelDestination(hotel.location, 'Srinagar') && hotelStayType(hotel) === 'houseboat');
  function startCustom(key: string) {
    useCustomHotel(key);
    setEditing(null);
    setRateReview(null);
  }
  function setNightType(day: number, houseboat: boolean) {
    const next = new Set(houseboatNightNumbers);
    if (houseboat) next.add(day); else next.delete(day);
    setSrinagarHouseboatNights([...next].sort((a, b) => a - b));
  }

  const currentPlan = plan;
  function needsRateReview(option: HotelOptionQuote) {
    return !Number.isFinite(option.nightlyRate) || option.nightlyRate <= 0 ||
      [option.extraBedRate, option.cnbRate].some((value) => !Number.isFinite(value) || value < 0);
  }
  function stayFooter(hotel: HotelSelection) {
    const priced = effectiveHotelSelection(hotel, optionMode);
    const record = db.find((item) => item.id === priced.hotelId);
    const total = hotel.nights * hotelOptionNightlyCost(priced, hotel);
    return (
        <div className="simple-hotel-footer"><span>{record?.rateValidity ? `Supplier validity · ${record.rateValidity}` : record ? 'Database rates' : 'Custom supplier rates'}</span><strong>{money(total)} <small>stay total</small></strong></div>
    );
  }
  function stayDetails(hotel: HotelSelection) {
      const key = hotelSelectionKey(hotel);
      const type = hotelStayType(hotel);
      const boat = type === 'houseboat';
      const fieldLabel = boat ? `${hotel.location} houseboat` : hotel.location;
      const record = db.find((item) => item.id === hotel.hotelId);
      const priced = effectiveHotelSelection(hotel, optionMode);
      const window = hotelStayWindow(currentPlan, hotel);
      const query = (hotelSearch[key] || '').trim().toLowerCase();
      const options = db.filter((item) => sameHotelDestination(item.destination, hotel.location) && isHouseboatHotel(item) === boat && (!query || `${item.name} ${item.normalizedCategory}`.toLowerCase().includes(query))).sort((a, b) => {
        const score = (item: typeof a) => (matchesPackageCategory(item, input.hotelCategory) ? 4 : 0) + (item.mapB2B && item.mapB2B > 0 ? 2 : 0) + (hotelRateValidity(item, window.arrival, window.departure) === 'matching' ? 1 : 0);
        return score(b) - score(a) || a.name.localeCompare(b.name);
      }).slice(0, 12);
      const custom = !hotel.hotelId;
      const allCustom = allHotelOptionsCustom(hotel, optionMode);
      const sharedRates = sharedCustomHotelRates(hotel, optionMode);
      const offered = hotelOptions(hotel, optionMode);
      const reviewed = multipleOptions && !allCustom && rateReview?.stayKey === key
        ? rateReview.alternativeIndex !== undefined
          ? hotel.alternatives?.[rateReview.alternativeIndex]
          : offered.find((option) => hotelOptionIdentity(option) === rateReview.optionId)
        : undefined;
      const rateTarget = sharedRates ? { ...hotel, ...sharedRates } : reviewed || priced;
      const primaryNeedsReview = multipleOptions && !allCustom && hotelOptionIdentity(hotel) !== hotelOptionIdentity(priced);
      const alternatives = multipleOptions ? Array.from({ length: 2 }, (_, index) => ({ option: hotel.alternatives?.[index], index })) : [];
      const alternativeCandidates = multipleOptions ? hotelAlternativeCandidates(hotel, db, input.hotelCategory, window.arrival, window.departure) : [];
      const namedOptions = offered.filter((option) => !needsStayName(option.hotelName)).length;
      const primaryQuoted = multipleOptions && !allCustom && !needsStayName(hotel.hotelName) && hotelOptionIdentity(hotel) === hotelOptionIdentity(priced);
    return <>
        <div className={`hotel-property-group${multipleOptions ? ' has-options' : ''}`}>
        {multipleOptions && <div className="hotel-options-heading"><h3>{boat ? 'Houseboat' : 'Hotel'} options</h3><span className="hotel-options-count">{namedOptions} of 3 added</span></div>}
        <div className="simple-hotel-choice"><div className="hotel-primary-identity">{multipleOptions && <span className="hotel-option-number" aria-hidden="true">01</span>}<div className="hotel-primary-property"><div className="hotel-primary-caption"><span className="overline">{multipleOptions ? 'PRIMARY' : 'SELECTED'} {boat ? 'HOUSEBOAT' : 'HOTEL'}</span>{primaryQuoted && <span className="hotel-quote-badge"><Check size={11} aria-hidden="true"/>Quote basis</span>}</div>{custom ? <input aria-label={`Custom ${type} in ${hotel.location}`} className="simple-custom-name" value={needsStayName(hotel.hotelName) ? '' : hotel.hotelName} placeholder={`Type ${type} name`} onChange={(event) => setHotelMeta(key, { hotelName: event.target.value || (boat ? 'Houseboat to be added' : 'Hotel to be added'), status: 'user-edited' })}/> : <><h3>{hotel.hotelName}</h3><p>{record?.normalizedCategory || hotel.category}{record?.roomType ? ` · ${record.roomType}` : ''}{!multipleOptions && record?.mapB2B ? ` · ${money(record.mapB2B)} recorded B2B rate` : ''}</p></>}</div></div><div className="simple-hotel-actions"><button type="button" className="secondary-link" aria-expanded={editing === key} onClick={() => setEditing(editing === key ? null : key)}>{custom ? 'Search database' : `Change ${type}`}</button>{primaryNeedsReview && <button type="button" className="hotel-option-review-button" aria-label={`Edit rate for ${hotel.hotelName}`} onClick={() => setRateReview({ stayKey: key, optionId: hotelOptionIdentity(hotel) })}>Edit rate</button>}{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(key)}>Use custom {type}</button>}</div></div>
        {editing === key && <div className="simple-hotel-search"><label><Search size={16}/><input aria-label={`Find ${type} in ${hotel.location}`} autoFocus value={hotelSearch[key] || ''} placeholder={`Search ${hotel.location} ${boat ? 'houseboats' : 'hotels'}`} onChange={(event) => setHotelSearch((current) => ({ ...current, [key]: event.target.value }))}/></label><div className="simple-hotel-results">{options.length ? options.map((option) => <button type="button" key={option.id} onClick={() => { replaceHotel(key, option.id); setEditing(null); }}><span><b>{option.name}</b><small>{option.normalizedCategory}{matchesPackageCategory(option, input.hotelCategory) ? ' · package match' : ''}</small></span><strong>{option.mapB2B ? money(option.mapB2B) : 'Rate needed'}</strong></button>) : <p>No matching {boat ? 'houseboats' : 'hotels'}. Try another name or enter a custom {type} below.</p>}</div>{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(key)}>Enter a custom {type} instead</button>}</div>}
        {multipleOptions && <div className="hotel-option-shortlist" aria-label={`Similar ${boat ? 'houseboats' : 'hotels'} in ${hotel.location}`}>
          {alternatives.map(({ option, index }, displayIndex) => {
            const isCustom = !option?.hotelId;
            const unused = !option || isUnusedHotelOption(option);
            const candidates = alternativeCandidates.filter((candidate) => candidate.id === option?.hotelId || !offered.some((chosen) => chosen.hotelId === candidate.id || chosen.hotelName.toLowerCase() === candidate.name.toLowerCase()));
            const currentIncluded = candidates.some((candidate) => candidate.id === option?.hotelId);
            const reviewNeeded = Boolean(option && needsRateReview(option));
            const showRateReview = !allCustom && !unused;
            const canClear = isCustom && !unused;
            const selectLabel = `Similar ${type} ${displayIndex + 1} in ${hotel.location}`;
            const quoted = !allCustom && !unused && option && hotelOptionIdentity(option) === hotelOptionIdentity(priced);
            return <div className={`hotel-option-row${isCustom ? ' is-custom-option' : ''}${showRateReview || canClear ? ' has-rate-review' : ''}${quoted ? ' is-quote-basis' : ''}`} key={`${key}-${index}`}>
              <span className="hotel-option-number" aria-hidden="true">0{index + 2}</span>
              <div className="hotel-option-label"><span>Similar {type} {displayIndex + 1}</span>{quoted ? <span className="hotel-quote-badge"><Check size={11} aria-hidden="true"/>Quote basis</span> : <small>{unused ? 'Optional' : isCustom ? 'Custom property' : 'From database'}</small>}</div>
              <div className="hotel-option-property">
                {isCustom && <input className="hotel-option-custom-name" aria-label={`Custom ${type} alternative ${displayIndex + 1} in ${hotel.location}`} value={option?.hotelName || ''} placeholder={`Custom ${type} name (optional)`} onChange={(event) => setCustomHotelAlternative(key, index, { hotelName: event.target.value })}/>}
                <select className={isCustom ? 'hotel-option-custom-source' : undefined} aria-label={selectLabel} value={option?.hotelId || ''} onChange={(event) => { if (event.target.value) replaceHotelAlternative(key, index, event.target.value); else setCustomHotelAlternative(key, index, {}); setRateReview(null); }}>
                  <option value="">Custom</option>
                  {!isCustom && !currentIncluded && <option value={option!.hotelId}>{option!.hotelName}</option>}
                  {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </div>
              {(showRateReview || canClear) && <div className="hotel-option-row-actions">{showRateReview && <button type="button" className="hotel-option-review-button" aria-label={`${reviewNeeded ? 'Set' : 'Edit'} rate for ${option?.hotelName || `custom ${type} alternative ${displayIndex + 1} in ${hotel.location}`}`} onClick={() => { if (!option) setCustomHotelAlternative(key, index, {}); setRateReview({ stayKey: key, alternativeIndex: index }); }}>{reviewNeeded ? 'Set rate' : 'Edit rate'}</button>}{canClear && <button type="button" className="hotel-option-clear" aria-label={`Clear custom ${type} alternative ${displayIndex + 1} in ${hotel.location}`} onClick={() => { setCustomHotelAlternative(key, index, { hotelName: '', nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }); if (rateReview?.stayKey === key && rateReview.alternativeIndex === index) setRateReview(null); }}><X size={13}/></button>}</div>}
            </div>;
          })}
        </div>}
        {multipleOptions && <div className="hotel-options-note"><div className="hotel-options-pricing"><HotelIcon size={16} aria-hidden="true"/><div><strong>{allCustom ? 'One shared supplier quote' : offered.length > 1 ? 'Highest option sets the quote' : 'One stay. Up to three options.'}</strong><p>{allCustom ? 'One rate for all custom options. Enter the highest supplier quote.' : offered.length > 1 ? <>Rates below use <b>{priced.hotelName}</b>. Alternative hotels are not added together.</> : 'Add similar hotels or custom names below your primary choice.'}</p></div></div>{alternatives.some(({ option }) => !option || isUnusedHotelOption(option)) && <p className="hotel-options-availability">{allCustom ? `Add the other custom ${type} names, or leave unused options blank.` : `Add a custom ${type} and its supplier rate, or leave the extra options blank.`}</p>}</div>}
        </div>
        <details className="hotel-adjustments" open={Boolean(reviewed) || needsRateReview(rateTarget)}><summary><span>Rooms &amp; rates <small>{hotel.rooms} room{hotel.rooms === 1 ? '' : 's'} · {money(rateTarget.nightlyRate)} / night</small></span><span className="hotel-adjustments-action">{needsRateReview(rateTarget) ? 'Enter rates' : 'Edit'}<ChevronRight size={15}/></span></summary>
        <div className="simple-hotel-fields"><section><div className="simple-field-title"><b>Rooms &amp; guests</b><span><strong>{input.adults}</strong> adults · <strong>{input.youngAges.length}</strong> children</span></div><div className="simple-counts"><CountInput label="Rooms" value={hotel.rooms} min={1} onChange={(value) => setHotelMeta(key, { rooms: value })}/><CountInput label="Extra beds" value={hotel.extraBeds} min={0} onChange={(value) => setHotelMeta(key, { extraBeds: value })}/><CountInput label="CNB" displayLabel="Child, no bed" value={hotel.cnb} min={0} onChange={(value) => setHotelMeta(key, { cnb: value })}/></div></section>
          <section><div className="simple-field-title"><b>{allCustom ? 'Highest supplier rate' : 'Internal rates'}</b><span>Per night · private</span></div>
            {reviewed && <div className="hotel-option-rate-review"><span>Editing <strong>{reviewed.hotelName || `custom ${type}`}</strong></span><button type="button" onClick={() => setRateReview(null)}>Back to highest rate</button></div>}
            {multipleOptions && !reviewed && <p className="hotel-rate-context">{allCustom ? 'Shared by all custom options' : <>Quote for <strong>{needsStayName(priced.hotelName) ? `your selected ${type}` : priced.hotelName}</strong></>}</p>}
            <div className="simple-rates" key={allCustom ? `${key}-shared-custom` : hotelOptionIdentity(rateTarget)}>
              <RateInput label={`${fieldLabel} room rate`} displayLabel="Room" value={rateTarget.nightlyRate} onChange={(value) => setHotelRate(key, 'nightlyRate', value)} onCommit={allCustom ? (value) => setSharedCustomHotelRate(key, 'nightlyRate', value) : multipleOptions ? (value) => setHotelOptionRate(key, hotelOptionIdentity(rateTarget), 'nightlyRate', value) : undefined}/>
              <RateInput label={`${fieldLabel} extra bed rate`} displayLabel="Extra bed" value={rateTarget.extraBedRate} onChange={(value) => setHotelRate(key, 'extraBedRate', value)} onCommit={allCustom ? (value) => setSharedCustomHotelRate(key, 'extraBedRate', value) : multipleOptions ? (value) => setHotelOptionRate(key, hotelOptionIdentity(rateTarget), 'extraBedRate', value) : undefined}/>
              <RateInput label={`${fieldLabel} CNB rate`} displayLabel="Child, no bed" value={rateTarget.cnbRate} onChange={(value) => setHotelRate(key, 'cnbRate', value)} onCommit={allCustom ? (value) => setSharedCustomHotelRate(key, 'cnbRate', value) : multipleOptions ? (value) => setHotelOptionRate(key, hotelOptionIdentity(rateTarget), 'cnbRate', value) : undefined}/>
            </div>
          </section>
        </div></details>
    </>;
  }
  function houseboatOptions() {
    return <div className="houseboat-add-on">
      <button type="button" className="houseboat-disclosure" aria-expanded={houseboatOpen} aria-controls="srinagar-houseboat-options" onClick={() => setHouseboatOpen((open) => !open)}>
        <span className="houseboat-disclosure-title"><Ship size={18}/>{houseboat ? 'Edit Houseboat' : 'Add Houseboat'}</span>
        <span className="houseboat-disclosure-summary">{houseboat ? `${houseboat.nights} night${houseboat.nights === 1 ? '' : 's'}${needsStayName(houseboat.hotelName) ? '' : ` · ${houseboat.hotelName}`}` : 'Optional · Srinagar'}<ChevronRight size={16}/></span>
      </button>
      {houseboatOpen && <section id="srinagar-houseboat-options" className="houseboat-options" aria-label="Srinagar houseboat stay">
        <div className="houseboat-options-heading"><div><h3>Choose houseboat nights</h3><p>Selected nights move from the hotel to your houseboat.</p></div><button type="button" className="simple-text-button" disabled={houseboatNights.size === srinagarNights.length} onClick={() => setSrinagarHouseboatNights(srinagarNights.map((night) => night.day))}>Use all nights</button></div>
        <div className="houseboat-night-options" role="group" aria-label="Choose Srinagar houseboat nights">{srinagarNights.map((night) => <button type="button" key={night.day} aria-label={`Houseboat for night ${night.day}, ${displayDate(night.date)}`} aria-pressed={houseboatNights.has(night.day)} onClick={() => setNightType(night.day, !houseboatNights.has(night.day))}><span>Night {night.day}</span><strong>{displayDate(night.date)}</strong>{houseboatNights.has(night.day) && <Ship size={14}/>}</button>)}</div>
        <div className="houseboat-allocation" aria-live="polite"><span>{hotelNightsCount} hotel night{hotelNightsCount === 1 ? '' : 's'} · {houseboatNights.size} houseboat night{houseboatNights.size === 1 ? '' : 's'}</span>{houseboatNights.size > 0 && <button type="button" className="simple-text-button" onClick={() => { setSrinagarHouseboatNights([]); setHouseboatOpen(false); }}>Remove houseboat</button>}</div>
        {houseboat && <div className="houseboat-stay-details">{stayDetails(houseboat)}{stayFooter(houseboat)}</div>}
      </section>}
    </div>;
  }

  const editor = <>
    {!embedded && hotelConnection !== 'ready' && <div className={`hotel-connection ${hotelConnection}`} role="status"><div><b>{hotelConnection === 'loading' ? 'Loading hotel suggestions…' : 'Hotel database needs attention'}</b><span>{hotelConnectionError || 'Checking the hotel database.'}</span></div>{hotelConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshHotels()}>Retry</button>}</div>}

    <div className="simple-hotel-list">{plan.hotelPlans.map((stay, index) => {
      const hotel = hotelSelections.find((item) => sameHotelDestination(item.location, stay.location) && hotelStayType(item) === 'hotel');
      const isSrinagar = sameHotelDestination(stay.location, 'Srinagar');
      const nightNumbers = new Set(hotel ? hotelNightNumbers(plan, hotel) : []);
      const nights = plan.dayPlans.slice(0, plan.nights).filter((day) => nightNumbers.has(day.day));
      return <article className="simple-hotel-card" key={stay.location} aria-label={`${stay.location} accommodation`}>
        <div className="simple-hotel-head"><div><span className="eyebrow">STAY {String(index + 1).padStart(2, '0')}</span><h2>{stay.location}</h2><div className="simple-night-dates">{nights.map((day) => <span key={day.day}>Night {day.day} · {displayDate(day.date)}</span>)}</div></div><span className="simple-night-count">{hotel?.nights || 0} hotel night{hotel?.nights === 1 ? '' : 's'}</span></div>
        {hotel && hotel.nights > 0 ? stayDetails(hotel) : <p className="hotel-nights-empty">{isSrinagar && houseboat ? 'All Srinagar nights are assigned to the houseboat.' : 'Choose overnight nights for this stay on the Destinations page.'}</p>}
        {isSrinagar && srinagarNights.length > 0 && (embedded ? houseboat && <section className="package-houseboat-quote" aria-label={`${input.hotelCategory} houseboat quote`}><div className="package-houseboat-heading"><Ship size={17}/><h3>Houseboat · {houseboat.nights} night{houseboat.nights === 1 ? '' : 's'}</h3></div>{stayDetails(houseboat)}{stayFooter(houseboat)}</section> : houseboatOptions())}
        {hotel && hotel.nights > 0 && stayFooter(hotel)}
      </article>;
    })}</div>

    {!embedded && <HotelFinalConfirmation/>}
    {!embedded && <div className="next-row"><Link className="secondary-link" href="/planner/destinations"><ChevronLeft size={16}/> Back to destinations</Link><div><b>Hotels chosen?</b><span>Transport and activities are next.</span></div><Link className="primary-cta inline" href="/planner/activities-transport">Next: Activities &amp; Transport <ChevronRight size={16}/></Link></div>}
  </>;
  return embedded ? <div className="package-hotel-editor">{editor}</div> : <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="hotel-workspace">{editor}</div></PlannerChrome></AppShell>;
}
