'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Hotel as HotelIcon, Minus, Plus, Search, Ship } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner, type HotelSelection } from '@/components/PlannerProvider';
import { isHouseboatHotel, matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';
import { hotelConfirmationSignature } from '@/lib/quote-readiness';
import { activeHotelSelections, hotelNightNumbers, hotelSelectionKey, hotelStayLabel, hotelStayType, hotelStayWindow } from '@/lib/accommodation';
import { effectiveHotelSelection, hotelAlternativeCandidates, hotelOptionCategory, hotelOptionNightlyCost, hotelOptions, type HotelOptionQuote } from '@/lib/hotel-options';
import './houseboat-stays.css';
import './hotel-options.css';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }
function displayDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function needsStayName(name: string) { const value = (name || '').trim(); return !value || ['Hotel to be added', 'Hotel to be confirmed', 'Houseboat to be added', 'Houseboat to be confirmed'].includes(value); }

function RateInput({ label, value, onChange, onCommit, minimum = 0 }: { label: string; value: number; onChange?: (next: number) => void; onCommit?: (next: number) => void; minimum?: number }) {
  const [text, setText] = useState(value > 0 ? String(Math.round(value)) : '');
  const [focused, setFocused] = useState(false);
  const commit = useRef(onCommit);
  useEffect(() => { if (!focused) setText(value > 0 ? String(Math.round(value)) : ''); }, [value, focused]);
  return <label className="stay-rate-field"><span>{label}</span><div><b>₹</b><input aria-label={label} type="number" min={minimum} value={text} placeholder="0" onFocus={() => { setFocused(true); commit.current = onCommit; }} onChange={(event) => { const next = event.target.value; setText(next); if (!onCommit) onChange?.(next === '' ? 0 : Math.max(0, Number(next) || 0)); }} onBlur={() => { const next = text === '' ? 0 : Math.max(0, Number(text) || 0); if (next >= minimum) commit.current?.(next); setFocused(false); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></div></label>;
}

function CountInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (next: number) => void }) {
  return <div className="stay-count-field"><span>{label}</span><div><button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14}/></button><strong>{value}</strong><button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}><Plus size={14}/></button></div></div>;
}

export default function HotelsPage() {
  const { plan, input, hotelSelections, replaceHotel, replaceHotelAlternative, setHotelRate, setHotelOptionRate, setHotelMeta, setSrinagarHouseboatNights, hotelDatabase: db, hotelConnection, hotelConnectionError, refreshHotels, hydrated } = usePlanner();
  const [editing, setEditing] = useState<string | null>(null);
  const [hotelSearch, setHotelSearch] = useState<Record<string, string>>({});
  const [houseboatOpen, setHouseboatOpen] = useState(false);
  const [rateReview, setRateReview] = useState<{ stayKey: string; hotelId: string } | null>(null);

  if (!hydrated) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28}/><h2>Loading hotel stays…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28}/><h2>Choose your destinations first</h2><Link className="primary-cta inline" href="/planner/destinations">Choose destinations <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const selected = activeHotelSelections(plan, hotelSelections);
  const optionMode = plan.input.hotelOptionMode || 'single';
  const multipleOptions = optionMode === 'multiple';
  const srinagarNights = plan.dayPlans.slice(0, plan.nights).filter((day) => sameHotelDestination(day.stay, 'Srinagar'));
  const houseboatNightNumbers = selected.filter((hotel) => sameHotelDestination(hotel.location, 'Srinagar') && hotelStayType(hotel) === 'houseboat').flatMap((hotel) => hotelNightNumbers(plan, hotel));
  const houseboatNights = new Set(houseboatNightNumbers);
  const hotelNightsCount = srinagarNights.length - houseboatNights.size;
  const houseboat = selected.find((hotel) => sameHotelDestination(hotel.location, 'Srinagar') && hotelStayType(hotel) === 'houseboat');
  const readyCount = selected.filter((hotel) => hotel.rooms > 0 && hotelOptions(hotel, optionMode).every((option) => !needsStayName(option.hotelName) && Number.isFinite(option.nightlyRate) && option.nightlyRate > 0)).length;
  const rateProblems = selected.flatMap((hotel) => {
    const label = hotelStayLabel(hotel);
    if (hotel.rooms <= 0) return [`Enter the number of rooms for ${label}.`];
    const window = hotelStayWindow(plan, hotel);
    const offered = hotelOptions(hotel, optionMode);
    const category = hotelOptionCategory(hotel, db);
    if (multipleOptions && (hotel.alternatives || []).length + 1 !== offered.length) return [`Choose up to three different properties for ${label}.`];
    return offered.flatMap((option) => {
      if (needsStayName(option.hotelName)) return [`Choose a ${hotelStayType(hotel)} in ${hotel.location}.`];
      if (!Number.isFinite(option.nightlyRate) || option.nightlyRate <= 0) return [`Enter the room rate for ${multipleOptions ? option.hotelName : label}.`];
      if (offered.length > 1 && category !== null && option.hotelId !== hotel.hotelId && option.category !== category) return [`Choose the same category for every ${label} option.`];
      const record = db.find((item) => item.id === option.hotelId);
      if (option.hotelId && !record) return [`Reselect ${multipleOptions ? option.hotelName : `the ${hotelStayType(hotel)} in ${hotel.location}`}.`];
      if (record && !sameHotelDestination(record.destination, hotel.location)) return [`Choose a property in ${hotel.location}.`];
      if (record && isHouseboatHotel(record) !== (hotelStayType(hotel) === 'houseboat')) return [`Choose a ${hotelStayType(hotel)} property for ${label}.`];
      if (!record && offered.length > 1 && option.hotelId !== hotel.hotelId && isHouseboatHotel({ name: option.hotelName, roomType: option.roomType, sourceCategory: option.category, sourceType: option.source }) !== (hotelStayType(hotel) === 'houseboat')) return [`Choose a ${hotelStayType(hotel)} property for ${label}.`];
      if (record && option.status !== 'user-edited' && hotelRateValidity(record, window.arrival, window.departure) === 'outside') return [`Review the ${multipleOptions ? option.hotelName : label} rate for these dates.`];
      return [];
    });
  });
  const canConfirm = hotelConnection === 'ready' && selected.length > 0 && readyCount === selected.length && rateProblems.length === 0;
  const allConfirmed = canConfirm && selected.every((hotel) => hotel?.rateConfirmed && hotel.confirmedSignature === hotelConfirmationSignature(plan, hotel, input.mealPlan));

  function confirmAll(confirmed: boolean) {
    if (!plan) return;
    if (confirmed && !canConfirm) return;
    for (const hotel of selected) {
      setHotelMeta(hotelSelectionKey(hotel), { rateConfirmed: confirmed, confirmedSignature: confirmed ? hotelConfirmationSignature(plan, hotel, input.mealPlan) : '' });
    }
  }
  function startCustom(key: string, type: 'hotel' | 'houseboat') {
    setHotelMeta(key, { hotelId: '', hotelName: type === 'houseboat' ? 'Houseboat to be added' : 'Hotel to be added', nightlyRate: 0, extraBedRate: 0, cnbRate: 0, alternatives: [], source: `Custom ${type}`, status: `Enter custom ${type} details` });
    setEditing(null);
  }
  function setNightType(day: number, houseboat: boolean) {
    const next = new Set(houseboatNightNumbers);
    if (houseboat) next.add(day); else next.delete(day);
    setSrinagarHouseboatNights([...next].sort((a, b) => a - b));
  }

  const currentPlan = plan;
  function needsRateReview(hotel: HotelSelection, option: HotelOptionQuote) {
    if (!Number.isFinite(option.nightlyRate) || option.nightlyRate <= 0) return true;
    const record = db.find((item) => item.id === option.hotelId);
    const window = hotelStayWindow(currentPlan, hotel);
    return Boolean(record && option.status !== 'user-edited' && hotelRateValidity(record, window.arrival, window.departure) === 'outside');
  }
  function stayFooter(hotel: HotelSelection) {
    const priced = effectiveHotelSelection(hotel, optionMode);
    const record = db.find((item) => item.id === priced.hotelId);
    const window = hotelStayWindow(currentPlan, hotel);
    const rateStatus = record ? hotelRateValidity(record, window.arrival, window.departure) : 'unverified';
    const total = hotel.nights * hotelOptionNightlyCost(priced, hotel);
    return (
        <div className="simple-hotel-footer"><span>{rateStatus === 'outside' && priced.status !== 'user-edited' ? 'Recorded rate is outside these dates. Enter the current supplier rate.' : record?.rateValidity ? `Supplier rate validity: ${record.rateValidity}` : 'Confirm rate and availability with the supplier.'}</span><strong>{money(total)} <small>stay cost</small></strong></div>
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
      const offered = hotelOptions(hotel, optionMode);
      const reviewed = multipleOptions && rateReview?.stayKey === key ? offered.find((option) => option.hotelId === rateReview.hotelId) : undefined;
      const rateTarget = reviewed || priced;
      const primaryNeedsReview = multipleOptions && hotel.hotelId !== priced.hotelId && needsRateReview(hotel, hotel);
      const alternatives = multipleOptions ? (hotel.alternatives || []).map((option, index) => ({ option, index })).sort((a, b) => hotelOptionNightlyCost(a.option, hotel) - hotelOptionNightlyCost(b.option, hotel)) : [];
      const alternativeCandidates = multipleOptions ? hotelAlternativeCandidates(hotel, db, input.hotelCategory, window.arrival, window.departure) : [];
    return <>
        <div className="simple-hotel-choice"><div><span className="overline">SELECTED {boat ? 'HOUSEBOAT' : 'HOTEL'}</span>{custom ? <input aria-label={`Custom ${type} in ${hotel.location}`} className="simple-custom-name" value={needsStayName(hotel.hotelName) ? '' : hotel.hotelName} placeholder={`Type ${type} name`} onChange={(event) => setHotelMeta(key, { hotelName: event.target.value || (boat ? 'Houseboat to be added' : 'Hotel to be added'), status: 'user-edited' })}/> : <><h3>{hotel.hotelName}</h3><p>{record?.normalizedCategory || hotel.category}{record?.roomType ? ` · ${record.roomType}` : ''}{!multipleOptions && record?.mapB2B ? ` · ${money(record.mapB2B)} recorded B2B rate` : ''}</p></>}</div><div className="simple-hotel-actions"><button type="button" className="secondary-link" aria-expanded={editing === key} onClick={() => setEditing(editing === key ? null : key)}>{custom ? 'Search database' : `Change ${type}`}</button>{primaryNeedsReview && <button type="button" className="hotel-option-review-button" aria-label={`Review rate for ${hotel.hotelName}`} onClick={() => setRateReview({ stayKey: key, hotelId: hotel.hotelId })}>Review rate</button>}{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(key, type)}>Use custom {type}</button>}</div></div>
        {editing === key && <div className="simple-hotel-search"><label><Search size={16}/><input aria-label={`Find ${type} in ${hotel.location}`} autoFocus value={hotelSearch[key] || ''} placeholder={`Search ${hotel.location} ${boat ? 'houseboats' : 'hotels'}`} onChange={(event) => setHotelSearch((current) => ({ ...current, [key]: event.target.value }))}/></label><div className="simple-hotel-results">{options.length ? options.map((option) => <button type="button" key={option.id} onClick={() => { replaceHotel(key, option.id); setEditing(null); }}><span><b>{option.name}</b><small>{option.normalizedCategory}{matchesPackageCategory(option, input.hotelCategory) ? ' · package match' : ''}</small></span><strong>{option.mapB2B ? money(option.mapB2B) : 'Rate needed'}</strong></button>) : <p>No matching {boat ? 'houseboats' : 'hotels'}. Try another name or enter a custom {type} below.</p>}</div>{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(key, type)}>Enter a custom {type} instead</button>}</div>}
        {multipleOptions && <div className="hotel-option-shortlist" aria-label={`Similar ${boat ? 'houseboats' : 'hotels'} in ${hotel.location}`}>
          {alternatives.map(({ option, index }, displayIndex) => {
            const candidates = alternativeCandidates.filter((candidate) => candidate.id === option.hotelId || !offered.some((chosen) => chosen.hotelId === candidate.id || chosen.hotelName.toLowerCase() === candidate.name.toLowerCase()));
            const currentIncluded = candidates.some((candidate) => candidate.id === option.hotelId);
            const reviewNeeded = option.hotelId !== priced.hotelId && needsRateReview(hotel, option);
            return <div className={`hotel-option-row${reviewNeeded ? ' has-rate-review' : ''}`} key={`${key}-${index}`}><span className="hotel-option-label">Similar {boat ? 'houseboat' : 'hotel'} {displayIndex + 1}</span><select aria-label={`Similar ${type} ${displayIndex + 1} in ${hotel.location}`} value={option.hotelId} onChange={(event) => replaceHotelAlternative(key, index, event.target.value)}>{!currentIncluded && <option value={option.hotelId}>{option.hotelName}</option>}{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>{reviewNeeded && <button type="button" className="hotel-option-review-button" aria-label={`Review rate for ${option.hotelName}`} onClick={() => setRateReview({ stayKey: key, hotelId: option.hotelId })}>Review rate</button>}</div>;
          })}
          {offered.length < 3 && <p className="hotel-options-availability">{offered.length === 1 && !(hotel.nightlyRate > 0) ? 'Enter a room rate for the primary property to find comparable options.' : <>{offered.length === 1 ? 'Only one matching' : 'Two matching'} {boat ? (offered.length === 1 ? 'houseboat' : 'houseboats') : (offered.length === 1 ? 'hotel' : 'hotels')} with comparable rates {offered.length === 1 ? 'is' : 'are'} available for this stay.</>}</p>}
          {offered.length > 1 && <p className="hotel-options-pricing">Quote rates from <strong>{priced.hotelName}</strong> · highest total among these options.</p>}
        </div>}
        <div className="simple-hotel-fields"><section><div className="simple-field-title"><b>Rooms &amp; guests</b><span>{input.adults} adults · {input.youngAges.length} children</span></div><div className="simple-counts"><CountInput label="Rooms" value={hotel.rooms} min={1} onChange={(value) => setHotelMeta(key, { rooms: value })}/><CountInput label="Extra beds" value={hotel.extraBeds} min={0} onChange={(value) => setHotelMeta(key, { extraBeds: value })}/><CountInput label="CNB" value={hotel.cnb} min={0} onChange={(value) => setHotelMeta(key, { cnb: value })}/></div></section><section><div className="simple-field-title"><b>Internal rates</b><span>Per night · private</span></div>{reviewed && <div className="hotel-option-rate-review"><span>Reviewing <strong>{reviewed.hotelName}</strong></span><button type="button" onClick={() => setRateReview(null)}>Back to highest rate</button></div>}<div className="simple-rates"><RateInput label={`${fieldLabel} room rate`} value={rateTarget.nightlyRate} minimum={multipleOptions && offered.length > 1 ? 1 : 0} onChange={(value) => setHotelRate(key, 'nightlyRate', value)} onCommit={multipleOptions ? (value) => setHotelOptionRate(key, rateTarget.hotelId, 'nightlyRate', value) : undefined}/><RateInput label={`${fieldLabel} extra bed rate`} value={rateTarget.extraBedRate} onChange={(value) => setHotelRate(key, 'extraBedRate', value)} onCommit={multipleOptions ? (value) => setHotelOptionRate(key, rateTarget.hotelId, 'extraBedRate', value) : undefined}/><RateInput label={`${fieldLabel} CNB rate`} value={rateTarget.cnbRate} onChange={(value) => setHotelRate(key, 'cnbRate', value)} onCommit={multipleOptions ? (value) => setHotelOptionRate(key, rateTarget.hotelId, 'cnbRate', value) : undefined}/></div></section></div>
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

  return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS">
    <section className="journey-intro hotels-simple-intro"><div><span className="eyebrow">OVERNIGHT STAYS</span><h2>Stays for the route you chose.</h2><p>Your suggested hotels are ready below. Adjust rooms and rates, or add an optional houseboat to your Srinagar stay.</p></div><div className="journey-intro-count"><strong>{readyCount}/{selected.length}</strong><span>stays priced</span></div></section>
    <div className={`hotel-connection ${hotelConnection}`} role="status"><div><b>{hotelConnection === 'ready' ? `${db.length} hotels available` : hotelConnection === 'loading' ? 'Loading hotel suggestions…' : 'Hotel database needs attention'}</b><span>{hotelConnection === 'ready' ? 'Showing the hotel master and its recorded supplier rates.' : hotelConnectionError || 'Checking the hotel database.'}</span></div>{hotelConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshHotels()}>Retry</button>}</div>

    <div className="simple-hotel-list">{plan.hotelPlans.map((stay, index) => {
      const hotel = hotelSelections.find((item) => sameHotelDestination(item.location, stay.location) && hotelStayType(item) === 'hotel');
      const isSrinagar = sameHotelDestination(stay.location, 'Srinagar');
      const nightNumbers = new Set(hotel ? hotelNightNumbers(plan, hotel) : []);
      const nights = plan.dayPlans.slice(0, plan.nights).filter((day) => nightNumbers.has(day.day));
      return <article className="simple-hotel-card" key={stay.location} aria-label={`${stay.location} accommodation`}>
        <div className="simple-hotel-head"><div><span className="eyebrow">STAY {String(index + 1).padStart(2, '0')}</span><h2>{stay.location}</h2><div className="simple-night-dates">{nights.map((day) => <span key={day.day}>Night {day.day} · {displayDate(day.date)}</span>)}</div></div><span className="simple-night-count">{hotel?.nights || 0} hotel night{hotel?.nights === 1 ? '' : 's'}</span></div>
        {hotel && hotel.nights > 0 ? stayDetails(hotel) : <p className="hotel-nights-empty">{isSrinagar && houseboat ? 'All Srinagar nights are assigned to the houseboat.' : 'Choose overnight nights for this stay on the Destinations page.'}</p>}
        {isSrinagar && srinagarNights.length > 0 && houseboatOptions()}
        {hotel && hotel.nights > 0 && stayFooter(hotel)}
      </article>;
    })}</div>

    <section className="hotel-all-confirm"><div><span className="eyebrow">ONE FINAL CHECK</span><h2>Verify all stays</h2><p>Check the selected hotels and houseboats, nightly prices, room setup, meal plan and availability for every listed date. If any stay or rate changes afterward, this verification clears automatically.</p>{rateProblems.length > 0 && <ul>{rateProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}</div><label><input type="checkbox" checked={allConfirmed} disabled={!canConfirm} onChange={(event) => confirmAll(event.target.checked)}/><span>I verified all {selected.length} stays for this client quote</span></label></section>
    <div className="next-row"><Link className="secondary-link" href="/planner/destinations"><ChevronLeft size={16}/> Back to destinations</Link><div><b>Hotels chosen?</b><span>Transport and activities are next.</span></div><Link className="primary-cta inline" href="/planner/activities-transport">Next: Activities &amp; Transport <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
