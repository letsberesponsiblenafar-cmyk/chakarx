'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Hotel as HotelIcon, Minus, Plus, Search } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';
import { hotelRateValidity, stayDateWindow } from '@/lib/hotel-rate-validity';
import { hotelConfirmationSignature } from '@/lib/quote-readiness';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }
function displayDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  const [text, setText] = useState(value > 0 ? String(Math.round(value)) : '');
  useEffect(() => setText(value > 0 ? String(Math.round(value)) : ''), [value]);
  return <label className="stay-rate-field"><span>{label}</span><div><b>₹</b><input aria-label={label} type="number" min="0" value={text} placeholder="0" onChange={(event) => { const next = event.target.value; setText(next); onChange(next === '' ? 0 : Math.max(0, Number(next) || 0)); }}/></div></label>;
}

function CountInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (next: number) => void }) {
  return <div className="stay-count-field"><span>{label}</span><div><button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14}/></button><strong>{value}</strong><button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}><Plus size={14}/></button></div></div>;
}

export default function HotelsPage() {
  const { plan, input, hotelSelections, replaceHotel, setHotelRate, setHotelMeta, hotelDatabase: db, hotelConnection, hotelConnectionError, refreshHotels, hydrated } = usePlanner();
  const [editing, setEditing] = useState<string | null>(null);
  const [hotelSearch, setHotelSearch] = useState<Record<string, string>>({});

  if (!hydrated) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28}/><h2>Loading hotel stays…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28}/><h2>Choose your destinations first</h2><Link className="primary-cta inline" href="/planner/destinations">Choose destinations <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const selected = plan.hotelPlans.map((row) => hotelSelections.find((hotel) => hotel.location === row.location));
  const readyCount = selected.filter((hotel) => hotel && hotel.hotelName && hotel.hotelName !== 'Hotel to be added' && hotel.nightlyRate > 0 && hotel.rooms > 0).length;
  const rateProblems = plan.hotelPlans.flatMap((row) => {
    const hotel = hotelSelections.find((item) => item.location === row.location);
    if (!hotel || !hotel.hotelName || hotel.hotelName === 'Hotel to be added') return [`Choose a hotel in ${row.location}.`];
    if (hotel.nightlyRate <= 0) return [`Enter the room rate for ${row.location}.`];
    const record = db.find((item) => item.id === hotel.hotelId);
    if (hotel.hotelId && !record) return [`Reselect the hotel in ${row.location}.`];
    const window = stayDateWindow(plan.dayPlans.slice(0, plan.nights), row.location);
    if (record && hotel.status !== 'user-edited' && hotelRateValidity(record, window.arrival, window.departure) === 'outside') return [`Update the ${row.location} rate for these dates.`];
    return [];
  });
  const canConfirm = hotelConnection === 'ready' && selected.length > 0 && readyCount === selected.length && rateProblems.length === 0;
  const allConfirmed = canConfirm && selected.every((hotel) => hotel?.rateConfirmed && hotel.confirmedSignature === hotelConfirmationSignature(plan, hotel, input.mealPlan));

  function confirmAll(confirmed: boolean) {
    if (!plan) return;
    if (confirmed && !canConfirm) return;
    for (const hotel of selected) {
      if (!hotel) continue;
      setHotelMeta(hotel.location, { rateConfirmed: confirmed, confirmedSignature: confirmed ? hotelConfirmationSignature(plan, hotel, input.mealPlan) : '' });
    }
  }
  function startCustom(location: string) {
    setHotelMeta(location, { hotelId: '', hotelName: 'Hotel to be added', nightlyRate: 0, extraBedRate: 0, cnbRate: 0, source: 'Custom hotel', status: 'Enter custom hotel details' });
    setEditing(null);
  }

  return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS">
    <section className="journey-intro hotels-simple-intro"><div><span className="eyebrow">OVERNIGHT STAYS</span><h2>Hotels for the route you chose.</h2><p>Suggested hotels are already attached where rates exist. Change a hotel, room setup or internal rate below, then verify the whole selection once at the end.</p></div><div className="journey-intro-count"><strong>{readyCount}/{plan.hotelPlans.length}</strong><span>stays priced</span></div></section>
    <div className={`hotel-connection ${hotelConnection}`} role="status"><div><b>{hotelConnection === 'ready' ? `${db.length} hotels available` : hotelConnection === 'loading' ? 'Loading hotel suggestions…' : 'Hotel database needs attention'}</b><span>{hotelConnection === 'ready' ? 'Showing the hotel master and its recorded supplier rates.' : hotelConnectionError || 'Checking the hotel database.'}</span></div>{hotelConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshHotels()}>Retry</button>}</div>

    <div className="simple-hotel-list">{plan.hotelPlans.map((row, index) => {
      const hotel = hotelSelections.find((item) => item.location === row.location);
      if (!hotel) return <div className="simple-hotel-card" key={row.location}><h2>{row.location}</h2><p>Loading this stay…</p></div>;
      const nights = plan.dayPlans.slice(0, plan.nights).filter((day) => day.stay === row.location);
      const record = db.find((item) => item.id === hotel.hotelId);
      const window = stayDateWindow(plan.dayPlans.slice(0, plan.nights), row.location);
      const rateStatus = record ? hotelRateValidity(record, window.arrival, window.departure) : 'unverified';
      const query = (hotelSearch[row.location] || '').trim().toLowerCase();
      const options = db.filter((item) => sameHotelDestination(item.destination, row.location) && (!query || `${item.name} ${item.normalizedCategory}`.toLowerCase().includes(query))).sort((a, b) => {
        const score = (item: typeof a) => (matchesPackageCategory(item, input.hotelCategory) ? 4 : 0) + (item.mapB2B && item.mapB2B > 0 ? 2 : 0) + (hotelRateValidity(item, window.arrival, window.departure) === 'matching' ? 1 : 0);
        return score(b) - score(a) || a.name.localeCompare(b.name);
      }).slice(0, 12);
      const custom = !hotel.hotelId;
      const total = hotel.nights * (hotel.rooms * hotel.nightlyRate + hotel.extraBeds * hotel.extraBedRate + hotel.cnb * hotel.cnbRate);
      return <article className="simple-hotel-card" key={row.location}>
        <div className="simple-hotel-head"><div><span className="eyebrow">STAY {String(index + 1).padStart(2, '0')}</span><h2>{row.location}</h2><div className="simple-night-dates">{nights.map((day) => <span key={day.day}>Night {day.day} · {displayDate(day.date)}</span>)}</div></div><span className="simple-night-count">{row.nights} night{row.nights === 1 ? '' : 's'}</span></div>
        <div className="simple-hotel-choice"><div><span className="overline">SELECTED HOTEL</span>{custom ? <input aria-label={`Custom hotel in ${row.location}`} className="simple-custom-name" value={hotel.hotelName === 'Hotel to be added' ? '' : hotel.hotelName} placeholder="Type hotel name" onChange={(event) => setHotelMeta(row.location, { hotelName: event.target.value || 'Hotel to be added', status: 'user-edited' })}/> : <><h3>{hotel.hotelName}</h3><p>{record?.normalizedCategory || hotel.category}{record?.roomType ? ` · ${record.roomType}` : ''}{record?.mapB2B ? ` · ${money(record.mapB2B)} recorded B2B rate` : ''}</p></>}</div><div className="simple-hotel-actions"><button type="button" className="secondary-link" aria-expanded={editing === row.location} onClick={() => setEditing(editing === row.location ? null : row.location)}>{custom ? 'Search database' : 'Change hotel'}</button>{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(row.location)}>Use custom hotel</button>}</div></div>
        {editing === row.location && <div className="simple-hotel-search"><label><Search size={16}/><input aria-label={`Find hotel in ${row.location}`} autoFocus value={hotelSearch[row.location] || ''} placeholder={`Search ${row.location} hotels`} onChange={(event) => setHotelSearch((current) => ({ ...current, [row.location]: event.target.value }))}/></label><div className="simple-hotel-results">{options.length ? options.map((option) => <button type="button" key={option.id} onClick={() => { replaceHotel(row.location, option.id); setEditing(null); }}><span><b>{option.name}</b><small>{option.normalizedCategory}{matchesPackageCategory(option, input.hotelCategory) ? ' · package match' : ''}</small></span><strong>{option.mapB2B ? money(option.mapB2B) : 'Rate needed'}</strong></button>) : <p>No matching hotels. Try another name or use a custom hotel.</p>}</div>{!custom && <button type="button" className="simple-text-button" onClick={() => startCustom(row.location)}>Enter a custom hotel instead</button>}</div>}
        <div className="simple-hotel-fields"><section><div className="simple-field-title"><b>Rooms &amp; guests</b><span>{input.adults} adults · {input.youngAges.length} children</span></div><div className="simple-counts"><CountInput label="Rooms" value={hotel.rooms} min={1} onChange={(value) => setHotelMeta(row.location, { rooms: value })}/><CountInput label="Extra beds" value={hotel.extraBeds} min={0} onChange={(value) => setHotelMeta(row.location, { extraBeds: value })}/><CountInput label="CNB" value={hotel.cnb} min={0} onChange={(value) => setHotelMeta(row.location, { cnb: value })}/></div></section><section><div className="simple-field-title"><b>Internal rates</b><span>Per night · private</span></div><div className="simple-rates"><RateInput label={`${row.location} room rate`} value={hotel.nightlyRate} onChange={(value) => setHotelRate(row.location, 'nightlyRate', value)}/><RateInput label={`${row.location} extra bed rate`} value={hotel.extraBedRate} onChange={(value) => setHotelRate(row.location, 'extraBedRate', value)}/><RateInput label={`${row.location} CNB rate`} value={hotel.cnbRate} onChange={(value) => setHotelRate(row.location, 'cnbRate', value)}/></div></section></div>
        <div className="simple-hotel-footer"><span>{rateStatus === 'outside' && hotel.status !== 'user-edited' ? 'Recorded rate is outside these dates. Enter the current supplier rate.' : record?.rateValidity ? `Supplier rate validity: ${record.rateValidity}` : 'Confirm rate and availability with the supplier.'}</span><strong>{money(total)} <small>stay cost</small></strong></div>
      </article>;
    })}</div>

    <section className="hotel-all-confirm"><div><span className="eyebrow">ONE FINAL CHECK</span><h2>Verify all hotel stays</h2><p>Check the selected hotels, nightly prices, room setup, meal plan and availability for every listed date. If any hotel or rate changes afterward, this verification clears automatically.</p>{rateProblems.length > 0 && <ul>{rateProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}</div><label><input type="checkbox" checked={allConfirmed} disabled={!canConfirm} onChange={(event) => confirmAll(event.target.checked)}/><span>I verified all {plan.hotelPlans.length} hotel stays for this client quote</span></label></section>
    <div className="next-row"><Link className="secondary-link" href="/planner/destinations"><ChevronLeft size={16}/> Back to destinations</Link><div><b>Hotels chosen?</b><span>Transport and activities are next.</span></div><Link className="primary-cta inline" href="/planner/activities-transport">Next: Activities &amp; Transport <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
