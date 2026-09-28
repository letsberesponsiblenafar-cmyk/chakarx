'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Hotel as HotelIcon, Info, Minus, Plus, UserRound, UsersRound } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { hotelDatabase, transportOptions, type Hotel } from '@/lib/data';
import { roomsRequired, cnbChildren, extraBedsRequired, sameHotelDestination } from '@/lib/hotels';

function money(v: number) { return `₹${Math.round(v).toLocaleString('en-IN')}`; }
function packageMatch(h: Hotel, category: string) {
  if (category === 'Signature') return h.normalizedCategory === 'Budget' || h.normalizedCategory === '3 Star';
  if (category === 'Signature Plus') return h.normalizedCategory === '3 Star Premium' || h.normalizedCategory === '3 Star Deluxe';
  if (category === 'Signature Premium') return h.normalizedCategory === '4 Star' || h.normalizedCategory === '4 Star Deluxe' || h.normalizedCategory === '4 Star Premium';
  if (category === 'Elite') return h.normalizedCategory === '5 Star Basic' || h.normalizedCategory === '5 Star Premium' || h.normalizedCategory === '5 Star' || h.normalizedCategory === 'Luxury';
  return true;
}
function Stepper({ value, min, onChange }: { value: number; min: number; onChange: (next: number) => void }) {
  return <div className="room-stepper"><button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease"><Minus size={12} /></button><strong>{value}</strong><button type="button" onClick={() => onChange(value + 1)} aria-label="Increase"><Plus size={12} /></button></div>;
}

export default function HotelsPage() {
  const { plan, input, hotelSelections, replaceHotel, setHotelRate, setHotelMeta, hotelDatabase: managedHotels, hotelDefaults, setHotelDefaults, applyHotelDefaults, setNightSequence, setTransport, costModel, setCostModel, hydrated } = usePlanner();
  const db = managedHotels.length ? managedHotels : hotelDatabase;
  const rows = useMemo(() => plan?.hotelPlans || [], [plan]);
  const [hotelSearch, setHotelSearch] = useState<Record<string,string>>({});
  const [hotelMode, setHotelMode] = useState<Record<string,'search'|'custom'>>({});
  const [nightAssignments, setNightAssignments] = useState<Record<number,string>>({});
  const [openNightDestination, setOpenNightDestination] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) return;
    const next: Record<number,string> = {};
    plan.dayPlans.slice(0, plan.nights).forEach((day, index) => { next[index + 1] = day.stay; });
    setNightAssignments(next);
  }, [plan]);

  if (!hydrated) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28} /><h2>Loading your hotel stays…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28} /><h2>Create the itinerary first.</h2><p>Your overnight locations will appear here with the imported hotel database.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16} /></Link></div></PlannerChrome></AppShell>;

  const adults = input.adults;
  const young = input.youngAges.length;
  const defaultRooms = roomsRequired(adults);
  const defaultExtra = extraBedsRequired(input.youngAges);
  const defaultCnb = cnbChildren(input.youngAges);
  const commonRooms = hotelDefaults.rooms || defaultRooms;
  const commonExtra = hotelDefaults.extraBeds;
  const commonCnb = hotelDefaults.cnb;
  const visibleDestinations = [...new Set(rows.map((r)=>r.location))];
  const totalAssigned = Object.keys(nightAssignments).length === plan.nights;
  const sequence = Array.from({length: plan.nights}, (_, i) => nightAssignments[i+1] || '');
  const sequenceChanged = sequence.join('|') !== plan.dayPlans.slice(0,plan.nights).map((d)=>d.stay).join('|');
  const attachedCount = rows.filter((row) => hotelSelections.find((x) => x.location === row.location)?.hotelName).length;
  const chargedDays = plan.dayPlans.length;

  function toggleNight(destination: string, night: number) {
    setNightAssignments((prev) => {
      const next={...prev};
      if(next[night]===destination) delete next[night];
      else next[night]=destination;
      return next;
    });
  }
  function nightDate(n: number) {return new Date(`${plan!.dayPlans[n-1].date}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'});}

  return <AppShell><PlannerChrome title="Hotels by overnight stay" eyebrow="STEP 02 · HOTELS">
    <div className="page-callout refined"><div><b>Choose exact nights and attach a hotel to each destination.</b><span>Every destination shows the full night calendar. Select a date to move it from another stay; then apply the distribution below the hotel cards.</span></div><div className="hotel-coverage-badge">{attachedCount}/{rows.length} hotels attached</div></div>

    <div className="common-hotel-policy hotel-policy-refresh"><div className="hotel-policy-intro"><b>Operator policy · common default</b><span>{adults} adult{adults===1?'':'s'} · {young} {young===1?'child':'children'}. Set occupancy and optional internal B2B rates once, then apply to every hotel.</span></div><div className="common-rate-grid hotel-policy-fields"><label>Rooms <input type="number" min="1" value={commonRooms} onChange={(e)=>setHotelDefaults({rooms:Math.max(1,+e.target.value||1)})}/></label><label>Extra beds <input type="number" min="0" value={commonExtra} onChange={(e)=>setHotelDefaults({extraBeds:Math.max(0,+e.target.value||0)})}/></label><label>CNB <input type="number" min="0" value={commonCnb} onChange={(e)=>setHotelDefaults({cnb:Math.max(0,+e.target.value||0)})}/></label><label>Room / night <input type="number" min="0" value={hotelDefaults.nightlyRate || ''} placeholder="Keep hotel rate" onChange={(e)=>setHotelDefaults({nightlyRate:Math.max(0,+e.target.value||0)})}/></label><label>Extra bed / night <input type="number" min="0" value={hotelDefaults.extraBedRate || ''} placeholder="Keep hotel rate" onChange={(e)=>setHotelDefaults({extraBedRate:Math.max(0,+e.target.value||0)})}/></label><label>CNB / night <input type="number" min="0" value={hotelDefaults.cnbRate || ''} placeholder="Keep hotel rate" onChange={(e)=>setHotelDefaults({cnbRate:Math.max(0,+e.target.value||0)})}/></label></div><button type="button" className="secondary-link common-apply" onClick={applyHotelDefaults}>Apply to all stays</button></div>

    <div className="hotel-list refined-hotel-list">{visibleDestinations.map((location) => {
      const sel = hotelSelections.find((x) => x.location === location);
      const chosen=Object.entries(nightAssignments).filter(([,name])=>name===location).map(([n])=>Number(n)).sort((a,b)=>a-b);
      const allNights=Array.from({length:plan.nights},(_,i)=>i+1);
      const open=openNightDestination===location;
      const nightSelector=<div className="hotel-night-selector"><button type="button" className="night-count-button" aria-expanded={open} onClick={()=>setOpenNightDestination(open?null:location)}><strong>{chosen.length}</strong><span>night{chosen.length===1?'':'s'} · choose dates</span></button><div className="chosen-night-dates">{chosen.length?chosen.map((n)=><span key={n}>Night {n} · {nightDate(n)}</span>):<span>No nights selected</span>}</div>{open&&<div className="night-picker-popover"><div className="night-picker-head"><b>All trip nights · {location}</b><span>Choose a night to move it here; selected nights are highlighted.</span></div><div className="night-chip-grid">{allNights.map((n)=>{const owner=nightAssignments[n];return <button key={n} type="button" aria-pressed={owner===location} title={owner&&owner!==location?`Currently in ${owner}. Click to move to ${location}.`:undefined} className={`night-chip ${owner===location?'active':owner?'assigned-elsewhere':'unassigned'}`} onClick={()=>toggleNight(location,n)}><span>Night {n}</span><b>{nightDate(n)}</b><small>{owner===location?'Selected here':owner||'Available'}</small></button>})}</div></div>}</div>;
      if(!sel)return <article className="hotel-card refined pending-stay-card" key={location}><div className="hotel-card-head"><div><span className="overline">NEW DESTINATION</span><h2>{location}</h2></div><span className="stay-location-badge warn">Choose a night</span></div>{nightSelector}<p>Once every night is assigned, apply the distribution to choose a hotel and calculate this stay.</p></article>;
      const options = db.filter((h) => sameHotelDestination(h.destination, location) && packageMatch(h, input.hotelCategory));
      const search = (hotelSearch[location] || '').toLowerCase();
      const filteredOptions = options.filter((h) => !search || `${h.name} ${h.normalizedCategory} ${h.starRating || ''}`.toLowerCase().includes(search));
      const current = db.find((h) => h.id === sel.hotelId) || options[0];
      const roomCost = sel.nights * sel.rooms * sel.nightlyRate; const extraCost = sel.nights * sel.extraBeds * sel.extraBedRate; const cnbCost = sel.nights * sel.cnb * sel.cnbRate; const hasRate = sel.nightlyRate > 0;
      const mode=hotelMode[location]||'search';
      return <article className="hotel-card refined" key={location}>
        <div className="hotel-card-head"><div><span className="overline">OVERNIGHT IN</span><h2>{location}</h2><p>{current?.sourceCategory||'Hotel database'} · {current?.rateValidity||'Rate validity not set'}</p></div><div className={hasRate?'stay-location-badge ok':'stay-location-badge warn'}>{hasRate?'B2B rate loaded':'B2B rate missing'}</div></div>
        {nightSelector}
        <div className="hotel-picker-block"><div className="picker-copy"><label>Hotel selection</label><b>{sel.hotelName}</b><small>{current?.address||'Address not enriched'}{current?.roomType?` · ${current.roomType}`:''}{current?.starRating?` · ${current.starRating}★`:''}</small></div><div className="hotel-picker-actions">
          <div className="hotel-mode-tabs"><button type="button" className={mode==='search'?'active':''} onClick={()=>setHotelMode((x)=>({...x,[location]:'search'}))}>Search hotel</button><button type="button" className={mode==='custom'?'active':''} onClick={()=>setHotelMode((x)=>({...x,[location]:'custom'}))}>Custom hotel</button></div>
          {mode==='search'?<><input className="hotel-search-input" aria-label={`Search hotel for ${location}`} placeholder="Search hotel by name or category" value={hotelSearch[location]||''} onChange={(e)=>setHotelSearch((x)=>({...x,[location]:e.target.value}))}/><select aria-label={`Hotel for ${location}`} value={sel.hotelId} onChange={(e)=>replaceHotel(location,e.target.value)}><option value="">Select hotel...</option>{filteredOptions.map((h)=><option key={h.id} value={h.id}>{h.name} · {h.normalizedCategory}{h.starRating?` · ${h.starRating}★`:''}{h.mapB2B?` · ${money(h.mapB2B)}`:' · rate missing'}</option>)}</select><button type="button" className="edit-small" onClick={()=>setHotelMode((x)=>({...x,[location]:'custom'}))}>Can’t find it? Add a custom hotel <ChevronRight size={13}/></button></>:<div className="custom-hotel-panel"><label>Hotel name <input value={sel.hotelId?'':sel.hotelName==='Hotel to be added'?'':sel.hotelName} onChange={(e)=>setHotelMeta(location,{hotelId:'',hotelName:e.target.value||'Hotel to be added',status:e.target.value?'custom hotel name':'Hotel to be attached'})}/></label><label>Room / night <input type="number" min="0" value={Math.round(sel.nightlyRate)} onChange={(e)=>setHotelRate(location,'nightlyRate',+e.target.value||0)}/></label><label>Extra bed / night <input type="number" min="0" value={Math.round(sel.extraBedRate)} onChange={(e)=>setHotelRate(location,'extraBedRate',+e.target.value||0)}/></label><label>CNB / night <input type="number" min="0" value={Math.round(sel.cnbRate)} onChange={(e)=>setHotelRate(location,'cnbRate',+e.target.value||0)}/></label><button type="button" className="edit-small" onClick={()=>setHotelMode((x)=>({...x,[location]:'search'}))}>Back to hotel database</button></div>}
        </div></div>
        <div className="hotel-detail-grid"><section className="occupancy-card room-setup-card"><div className="small-card-head"><span>ROOM SETUP</span><b>Operator-controlled occupancy</b></div><div className="occupancy-mini-row"><span><UserRound size={11}/>{adults} adults</span><span><UsersRound size={11}/>{young} children</span></div><div className="room-setup-rows"><label><span>Rooms</span><Stepper value={sel.rooms||defaultRooms} min={1} onChange={(n)=>setHotelMeta(location,{rooms:n})}/></label><label><span>Extra beds</span><Stepper value={sel.extraBeds} min={0} onChange={(n)=>setHotelMeta(location,{extraBeds:n})}/></label><label><span>CNB</span><Stepper value={sel.cnb} min={0} onChange={(n)=>setHotelMeta(location,{cnb:n})}/></label></div><div className="room-setup-note">Suggested starting point: {defaultRooms} room{defaultRooms!==1?'s':''}{defaultExtra?` + ${defaultExtra} extra bed${defaultExtra!==1?'s':''}`:''}{defaultCnb?` + ${defaultCnb} CNB`:''}.</div></section>
          <section className="rate-card"><div className="small-card-head"><span>INTERNAL B2B RATES</span><b>Private operator view</b></div><div className="rate-rows"><label><span>MAP / room / night</span><div><b>₹</b><input type="number" min="0" value={Math.round(sel.nightlyRate)} onChange={(e)=>setHotelRate(location,'nightlyRate',+e.target.value||0)}/></div></label><label><span>Extra bed / night</span><div><b>₹</b><input type="number" min="0" value={Math.round(sel.extraBedRate)} onChange={(e)=>setHotelRate(location,'extraBedRate',+e.target.value||0)}/></div></label><label><span>CNB / night</span><div><b>₹</b><input type="number" min="0" value={Math.round(sel.cnbRate)} onChange={(e)=>setHotelRate(location,'cnbRate',+e.target.value||0)}/></div></label></div></section>
          <section className="stay-cost-card"><div className="small-card-head"><span>STAY COST</span><b>Internal B2B calculation</b></div><div className="stay-cost-breakdown"><div><span>Rooms</span><b>{money(roomCost)}</b><small>{sel.nights}N × {sel.rooms} room{sel.rooms!==1?'s':''}</small></div><div><span>Extra beds</span><b>{money(extraCost)}</b><small>{sel.nights}N × {sel.extraBeds} EB</small></div><div><span>CNB</span><b>{money(cnbCost)}</b><small>{sel.nights}N × {sel.cnb} CNB</small></div></div><div className="stay-total-row"><span>Total accommodation</span><strong>{money(roomCost+extraCost+cnbCost)}</strong></div></section>
        </div>
        <div className="hotel-card-foot refined-foot"><span><Info size={12}/>{sel.status}</span></div>
      </article>;
    })}</div>

    <div className="night-edit-toolbar"><div><b>{Object.keys(nightAssignments).length}/{plan.nights} nights assigned</b><span>{sequenceChanged?'Apply the distribution to update the itinerary, hotels and quote.':'Open any hotel’s night count to see and change the full calendar.'}</span></div><div className="night-toolbar-actions"><button type="button" className="secondary-link" onClick={()=>{setNightAssignments({});setOpenNightDestination(rows[0]?.location||null)}}>Start with blank dates</button><button type="button" className="primary-cta inline" disabled={!totalAssigned||!sequenceChanged} onClick={()=>setNightSequence(sequence)}>Apply night distribution</button></div></div>

    <section className="transport-setup-card"><div><span className="overline">AFTER HOTELS · TRANSPORT</span><h2>Choose the vehicle and daily cost</h2><p>The selected vehicle appears in the client package. Its rate is charged for {chargedDays} service days and flows into Costing.</p></div><div className="transport-setup-fields"><label>Vehicle<select value={input.transport} onChange={(e)=>setTransport(e.target.value)}>{transportOptions.map((vehicle)=><option key={vehicle} value={vehicle}>{vehicle}</option>)}</select></label><label>Cost per day<div className="transport-money-input"><span>₹</span><input type="number" min="0" value={costModel.transportDaily} onChange={(e)=>setCostModel({transportDaily:Math.max(0,Number(e.target.value)||0)})}/></div></label><div className="transport-setup-total"><span>Transport estimate</span><b>{money(chargedDays*costModel.transportDaily)}</b><small>{chargedDays} days × {money(costModel.transportDaily)}</small></div></div><p className="transport-suggestion">{adults+young>6?'For this group size, a Tempo Traveller may provide a more comfortable fit.':adults+young>3?'For this group size, Ertiga or Innova may provide a more comfortable fit.':'A Sedan may be sufficient for this group size; choose based on luggage and comfort.'}</p></section>

    <div className="next-row"><Link className="secondary-link" href="/planner/itinerary"><ChevronLeft size={16}/> Back to itinerary</Link><div><b>Hotel layer complete?</b><span>Next, set markup and calculate the customer price.</span></div><Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
