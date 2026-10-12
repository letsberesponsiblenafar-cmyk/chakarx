'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Hotel as HotelIcon, Minus, Plus, Search, Ship } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { isHouseboatHotel, matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';
import { hotelConfirmationSignature } from '@/lib/quote-readiness';
import { activeHotelSelections, hotelNightNumbers, hotelSelectionKey, hotelStayLabel, hotelStayType, hotelStayWindow } from '@/lib/accommodation';
import './houseboat-stays.css';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }
function displayDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function needsStayName(name: string) { const value = (name || '').trim(); return !value || ['Hotel to be added', 'Hotel to be confirmed', 'Houseboat to be added', 'Houseboat to be confirmed'].includes(value); }

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  const [text, setText] = useState(value > 0 ? String(Math.round(value)) : '');
  useEffect(() => setText(value > 0 ? String(Math.round(value)) : ''), [value]);
  return <label className="stay-rate-field"><span>{label}</span><div><b>₹</b><input aria-label={label} type="number" min="0" value={text} placeholder="0" onChange={(event) => { const next = event.target.value; setText(next); onChange(next === '' ? 0 : Math.max(0, Number(next) || 0)); }}/></div></label>;
}

function CountInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (next: number) => void }) {
  return <div className="stay-count-field"><span>{label}</span><div><button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14}/></button><strong>{value}</strong><button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}><Plus size={14}/></button></div></div>;
}

export default function HotelsPage() {
  const { plan, input, hotelSelections, replaceHotel, setHotelRate, setHotelMeta, setSrinagarHouseboatNights, hotelDatabase: db, hotelConnection, hotelConnectionError, refreshHotels, hydrated } = usePlanner();
  const [editing, setEditing] = useState<string | null>(null);
  const [hotelSearch, setHotelSearch] = useState<Record<string, string>>({});

  if (!hydrated) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28}/><h2>Loading hotel stays…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28}/><h2>Choose your destinations first</h2><Link className="primary-cta inline" href="/planner/destinations">Choose destinations <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const selected = activeHotelSelections(plan, hotelSelections);
  const srinagarNights = plan.dayPlans.slice(0, plan.nights).filter((day) => sameHotelDestination(day.stay, 'Srinagar'));
  const houseboatNightNumbers = selected.filter((hotel) => sameHotelDestination(hotel.location, 'Srinagar') && hotelStayType(hotel) === 'houseboat').flatMap((hotel) => hotelNightNumbers(plan, hotel));
  const houseboatNights = new Set(houseboatNightNumbers);
  const hotelNightsCount = srinagarNights.length - houseboatNights.size;
  const readyCount = selected.filter((hotel) => !needsStayName(hotel.hotelName) && hotel.nightlyRate > 0 && hotel.rooms > 0).length;
  const rateProblems = selected.flatMap((hotel) => {
    const label = hotelStayLabel(hotel);
    if (needsStayName(hotel.hotelName)) return [`Choose a ${hotelStayType(hotel)} in ${hotel.location}.`];
    if (hotel.nightlyRate <= 0) return [`Enter the room rate for ${label}.`];
    if (hotel.rooms <= 0) return [`Enter the number of rooms for ${label}.`];
    const record = db.find((item) => item.id === hotel.hotelId);
    if (hotel.hotelId && !record) return [`Reselect the ${hotelStayType(hotel)} in ${hotel.location}.`];
    const window = hotelStayWindow(plan, hotel);
    if (record && hotel.status !== 'user-edited' && hotelRateValidity(record, window.arrival, window.departure) === 'outside') return [`Update the ${label} rate for these dates.`];
    return [];
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
    setHotelMeta(key, { hotelId: '', hotelName: type === 'houseboat' ? 'Houseboat to be added' : 'Hotel to be added', nightlyRate: 0, extraBedRate: 0, cnbRate: 0, source: `Custom ${type}`, status: `Enter custom ${type} details` });
    setEditing(null);
  }
  function setNightType(day: number, houseboat: boolean) {
    const next = new Set(houseboatNightNumbers);
    if (houseboat) next.add(day); else next.delete(day);
    setSrinagarHouseboatNights([...next].sort((a, b) => a - b));
  }

  return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS">
    <section className="journey-intro hotels-simple-intro"><div><span className="eyebrow">OVERNIGHT STAYS</span><h2>Stays for the route you chose.</h2><p>Choose a hotel or houseboat for your Srinagar nights. Adjust each stay, room setup and internal rate below, then verify the whole selection once at the end.</p></div><div className="journey-intro-count"><strong>{readyCount}/{selected.length}</strong><span>stays priced</span></div></section>
    <div className={`hotel-connection ${hotelConnection}`} role="status"><div><b>{hotelConnection === 'ready' ? `${db.length} hotels available` : hotelConnection === 'loading' ? 'Loading hotel suggestions…' : 'Hotel database needs attention'}</b><span>{hotelConnection === 'ready' ? 'Showing the hotel master and its recorded supplier rates.' : hotelConnectionError || 'Checking the hotel database.'}</span></div>{hotelConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshHotels()}>Retry</button>}</div>

    {srinagarNights.length > 0 && <section className="srinagar-stay-split" aria-labelledby="srinagar-stay-heading">
      <div className="srinagar-split-heading"><div><span className="eyebrow">YOUR SRINAGAR NIGHTS</span><h2 id="srinagar-stay-heading">Hotel, houseboat, or a little of both.</h2><p>Choose a stay for each night. Your hotel and houseboat have their own room setup and rates.</p></div><div className="srinagar-split-summary" aria-live="polite"><span><HotelIcon size={17}/><strong>{hotelNightsCount}</strong> hotel night{hotelNightsCount === 1 ? '' : 's'}</span><span><Ship size={17}/><strong>{houseboatNights.size}</strong> houseboat night{houseboatNights.size === 1 ? '' : 's'}</span></div></div>
      <div className="srinagar-split-tools"><span>{srinagarNights.length} Srinagar night{srinagarNights.length === 1 ? '' : 's'}</span><div><button type="button" onClick={() => setSrinagarHouseboatNights([])} disabled={houseboatNights.size === 0}>All hotel</button><button type="button" onClick={() => setSrinagarHouseboatNights(srinagarNights.map((night) => night.day))} disabled={houseboatNights.size === srinagarNights.length}>All houseboat</button></div></div>
      <div className="srinagar-night-options">{srinagarNights.map((night) => <div className="srinagar-night-option" key={night.day}><div><span>Night {String(night.day).padStart(2, '0')}</span><strong>{displayDate(night.date)}</strong></div><div className="srinagar-night-toggle" role="group" aria-label={`Stay for Srinagar night ${night.day}`}><button type="button" aria-pressed={!houseboatNights.has(night.day)} onClick={() => setNightType(night.day, false)}><HotelIcon size={15}/>Hotel</button><button type="button" aria-pressed={houseboatNights.has(night.day)} onClick={() => setNightType(night.day, true)}><Ship size={15}/>Houseboat</button></div></div>)}</div>
    </section>}

    <div className="simple-hotel-list">{selected.map((hotel, index) => {
      const key = hotelSelectionKey(hotel);
      const type = hotelStayType(hotel);
      const boat = type === 'houseboat';
      const label = hotelStayLabel(hotel);
      const fieldLabel = boat ? `${hotel.location} houseboat` : hotel.location;
      const nightNumbers = new Set(hotelNightNumbers(plan, hotel));
      const nights = plan.dayPlans.slice(0, plan.nights).filter((day) => nightNumbers.has(day.day));
      const record = db.find((item) => item.id === hotel.hotelId);
      const window = hotelStayWindow(plan, hotel);
      const rateStatus = record ? hotelRateValidity(record, window.arrival, window.departure) : 'unverified';
      const query = (hotelSearch[key] || '').trim().toLowerCase();
      const options = db.filter((item) => sameHotelDestination(item.destination, hotel.location) && isHouseboatHotel(item) === boat && (!query || `${item.name} ${item.normalizedCategory}`.toLowerCase().includes(query))).sort((a, b) => {
        const score = (item: typeof a) => (matchesPackageCategory(item, input.hotelCategory) ? 4 : 0) + (item.mapB2B && item.mapB2B > 0 ? 2 : 0) + (hotelRateValidity(item, window.arrival, window.departure) === 'matching' ? 1 : 0);
        return score(b) - score(a) || a.name.localeCompare(b.name);
      }).slice(0, 12);
      const custom = !hotel.hotelId;
      const total = hotel.nights * (hotel.rooms * hotel.nightlyRate + hotel.extraBeds * hotel.extraBedRate + hotel.cnb * hotel.cnbRate);
      return <article className={`simple-hotel-card${boat ? ' houseboat-hotel-card' : ''}`} key={key}>
        <div className="simple-hotel-head"><div><span className="eyebrow">STAY {String(index + 1).padStart(2, '0')}{boat ? ' · HOUSEBOAT' : ''}</span><h2>{label}</h2><div className="simple-night-dates">{nights.map((day) => <span key={day.day}>Night {day.day} · {displayDate(day.date)}</span>)}</div></div><span className="simple-night-count">{hotel.nights} night{hotel.nights === 1 ? '' : 's'}</span></div>
        <div className="simple-hotel-choice"><div><span className="overline">SELECTED {boat ? 'HOUSEBOAT' : 'HOTEL'}</span>{custom ? <input aria-label={`Custom ${type} in ${hotel.location}`} className="simple-custom-name" value={needsStayName(hotel.hotelName) ? '' : hotel.hotelName} placeholder={`Type ${type} name`} onChange={(event) => setHotelMeta(key, { hotelName: event.target.value || (boat ? 'Houseboat to be added' : 'Hotel to be added'), status: 'user-edited' })}/> : <><h3>{hotel.hotelName}</h3><p>{record?.normalizedCategory || hotel.category}{record?.roomType ? ` · ${record.roomType}` : ''}{record?.mapB2B ? ` · ${money(record.mapB2B)} recorded B2B rate` : ''}</p></>}</div><div className="simple-hotel-actions"><button type="button" className="secondary-link" aria-expanded={editing === key} onClick={() => setEditing(editing === key ? null : key)}>{custom ? 'Search database' : `Change ${type}`}</button>{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(key, type)}>Use custom {type}</button>}</div></div>
        {editing === key && <div className="simple-hotel-search"><label><Search size={16}/><input aria-label={`Find ${type} in ${hotel.location}`} autoFocus value={hotelSearch[key] || ''} placeholder={`Search ${hotel.location} ${boat ? 'houseboats' : 'hotels'}`} onChange={(event) => setHotelSearch((current) => ({ ...current, [key]: event.target.value }))}/></label><div className="simple-hotel-results">{options.length ? options.map((option) => <button type="button" key={option.id} onClick={() => { replaceHotel(key, option.id); setEditing(null); }}><span><b>{option.name}</b><small>{option.normalizedCategory}{matchesPackageCategory(option, input.hotelCategory) ? ' · package match' : ''}</small></span><strong>{option.mapB2B ? money(option.mapB2B) : 'Rate needed'}</strong></button>) : <p>No matching {boat ? 'houseboats' : 'hotels'}. Try another name or enter a custom {type} below.</p>}</div>{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(key, type)}>Enter a custom {type} instead</button>}</div>}
        <div className="simple-hotel-fields"><section><div className="simple-field-title"><b>Rooms &amp; guests</b><span>{input.adults} adults · {input.youngAges.length} children</span></div><div className="simple-counts"><CountInput label="Rooms" value={hotel.rooms} min={1} onChange={(value) => setHotelMeta(key, { rooms: value })}/><CountInput label="Extra beds" value={hotel.extraBeds} min={0} onChange={(value) => setHotelMeta(key, { extraBeds: value })}/><CountInput label="CNB" value={hotel.cnb} min={0} onChange={(value) => setHotelMeta(key, { cnb: value })}/></div></section><section><div className="simple-field-title"><b>Internal rates</b><span>Per night · private</span></div><div className="simple-rates"><RateInput label={`${fieldLabel} room rate`} value={hotel.nightlyRate} onChange={(value) => setHotelRate(key, 'nightlyRate', value)}/><RateInput label={`${fieldLabel} extra bed rate`} value={hotel.extraBedRate} onChange={(value) => setHotelRate(key, 'extraBedRate', value)}/><RateInput label={`${fieldLabel} CNB rate`} value={hotel.cnbRate} onChange={(value) => setHotelRate(key, 'cnbRate', value)}/></div></section></div>
        <div className="simple-hotel-footer"><span>{rateStatus === 'outside' && hotel.status !== 'user-edited' ? 'Recorded rate is outside these dates. Enter the current supplier rate.' : record?.rateValidity ? `Supplier rate validity: ${record.rateValidity}` : 'Confirm rate and availability with the supplier.'}</span><strong>{money(total)} <small>stay cost</small></strong></div>
      </article>;
    })}</div>

    <section className="hotel-all-confirm"><div><span className="eyebrow">ONE FINAL CHECK</span><h2>Verify all stays</h2><p>Check the selected hotels and houseboats, nightly prices, room setup, meal plan and availability for every listed date. If any stay or rate changes afterward, this verification clears automatically.</p>{rateProblems.length > 0 && <ul>{rateProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}</div><label><input type="checkbox" checked={allConfirmed} disabled={!canConfirm} onChange={(event) => confirmAll(event.target.checked)}/><span>I verified all {selected.length} stays for this client quote</span></label></section>
    <div className="next-row"><Link className="secondary-link" href="/planner/destinations"><ChevronLeft size={16}/> Back to destinations</Link><div><b>Hotels chosen?</b><span>Transport and activities are next.</span></div><Link className="primary-cta inline" href="/planner/activities-transport">Next: Activities &amp; Transport <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
