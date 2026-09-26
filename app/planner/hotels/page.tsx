'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BedDouble, ChevronLeft, ChevronRight, Hotel as HotelIcon, Info, Minus, Plus, Search, UserRound, UsersRound } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { destinations, hotelDatabase, type Hotel } from '@/lib/data';
import { destinationPriority } from '@/lib/intelligence';
import { roomsRequired, cnbChildren, extraBedsRequired } from '@/lib/hotels';

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
function priorityRank(name: string) { return ({ CORE: 4, SECONDARY: 3, OFFBEAT: 2, LOW_PRIORITY: 1, TREK_ONLY: 0 } as Record<string, number>)[destinationPriority(name)] || 0; }

export default function HotelsPage() {
  const { plan, input, hotelSelections, replaceHotel, setHotelRate, setHotelMeta, hotelDatabase: managedHotels, hotelDefaults, setHotelDefaults, applyHotelDefaults, setNightSequence } = usePlanner();
  const db = managedHotels.length ? managedHotels : hotelDatabase;
  const rows = useMemo(() => plan?.hotelPlans || [], [plan]);
  const [hotelSearch, setHotelSearch] = useState<Record<string,string>>({});
  const [hotelMode, setHotelMode] = useState<Record<string,'search'|'custom'>>({});
  const [nightAssignments, setNightAssignments] = useState<Record<number,string>>({});
  const [openNightDestination, setOpenNightDestination] = useState<string | null>(null);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [appliedSequence, setAppliedSequence] = useState<string[]>([]);

  useEffect(() => {
    if (!plan) return;
    const next: Record<number,string> = {};
    plan.dayPlans.slice(0, plan.nights).forEach((day, index) => { next[index + 1] = day.stay; });
    setNightAssignments(next);
    setAppliedSequence(plan.dayPlans.slice(0, plan.nights).map((d) => d.stay));
  }, [plan]);

  if (!plan) return <AppShell><PlannerChrome title="Choose your hotels" eyebrow="STEP 02 · HOTELS"><div className="empty-panel"><HotelIcon size={28} /><h2>Create the itinerary first.</h2><p>Your overnight locations will appear here with the imported hotel database.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16} /></Link></div></PlannerChrome></AppShell>;

  const adults = input.adults;
  const young = input.youngAges.length;
  const defaultRooms = roomsRequired(adults);
  const defaultExtra = extraBedsRequired(input.youngAges);
  const defaultCnb = cnbChildren(input.youngAges);
  const commonRooms = hotelDefaults.rooms || defaultRooms;
  const commonExtra = hotelDefaults.extraBeds;
  const commonCnb = hotelDefaults.cnb;
  const assignedDestinations = Array.from(new Set(Object.values(nightAssignments))).filter(Boolean);
  const currentDestinationOptions = destinations.filter((d) => assignedDestinations.includes(d.name));
  const allDestinationOptions = destinations.filter((d) => d.overnight_allowed && !assignedDestinations.includes(d.name)).sort((a,b) => priorityRank(b.name)-priorityRank(a.name) || a.name.localeCompare(b.name));
  const totalAssigned = Object.keys(nightAssignments).length === plan.nights;
  const sequence = Array.from({length: plan.nights}, (_, i) => nightAssignments[i+1]).filter(Boolean) as string[];
  const sequenceChanged = sequence.join('|') !== appliedSequence.join('|');
  const attachedCount = rows.filter((row) => hotelSelections.find((x) => x.location === row.location)?.hotelName).length;

  function toggleNight(destination: string, night: number) {
    setNightAssignments((prev) => ({ ...prev, [night]: destination }));
  }

  return <AppShell><PlannerChrome title="Hotels by overnight stay" eyebrow="STEP 02 · HOTELS">
    <div className="page-callout refined"><div><b>Plan the overnight pattern, then attach one hotel to each destination.</b><span>Click the night count beside a destination to choose the exact nights it owns. A night can belong to only one destination.</span></div><div className="hotel-coverage-badge">{attachedCount}/{rows.length} hotels attached</div></div>

    <div className="traveler-occupancy refined-occupancy">
      <div><UserRound size={14} /><span>Adults</span><b>{adults}</b></div><div><UsersRound size={14} /><span>Children ≤14</span><b>{young}</b></div>
      <div><BedDouble size={14} /><span>Common rooms</span><input className="mini-number" type="number" min="1" value={commonRooms} onChange={(e)=>setHotelDefaults({rooms:Math.max(1,+e.target.value||1)})}/></div>
      <div><Plus size={14} /><span>Common extra beds</span><input className="mini-number" type="number" min="0" value={commonExtra} onChange={(e)=>setHotelDefaults({extraBeds:Math.max(0,+e.target.value||0)})}/></div>
      <div><span>Common CNB</span><input className="mini-number" type="number" min="0" value={commonCnb} onChange={(e)=>setHotelDefaults({cnb:Math.max(0,+e.target.value||0)})}/></div>
      <div><button className="edit-small" type="button" onClick={applyHotelDefaults}>Apply common setup</button></div>
    </div>

    <div className="common-hotel-policy"><div><b>Operator policy · common default</b><span>Set the normal occupancy and internal B2B rates once. They apply to every stay unless you override an individual hotel.</span></div><div className="common-rate-grid"><label>Room / night <input type="number" min="0" value={hotelDefaults.nightlyRate || ''} placeholder="Keep hotel rate" onChange={(e)=>setHotelDefaults({nightlyRate:Math.max(0,+e.target.value||0)})}/></label><label>Extra bed / night <input type="number" min="0" value={hotelDefaults.extraBedRate || ''} placeholder="Keep hotel rate" onChange={(e)=>setHotelDefaults({extraBedRate:Math.max(0,+e.target.value||0)})}/></label><label>CNB / night <input type="number" min="0" value={hotelDefaults.cnbRate || ''} placeholder="Keep hotel rate" onChange={(e)=>setHotelDefaults({cnbRate:Math.max(0,+e.target.value||0)})}/></label></div><button type="button" className="secondary-link common-apply" onClick={applyHotelDefaults}>Apply to all stays</button></div>

    <section className="night-allocation-card compact-night-planner">
      <div className="allocation-head"><div><span className="overline">OVERNIGHT PLANNER</span><h2>Assign the {plan.nights} nights</h2><p>Each destination shows how many nights it currently owns. Click that number to choose exact nights — for example, Gurez can take Night 1 and Night 3 while the remaining nights stay elsewhere.</p></div><div className={totalAssigned?'allocation-total ok':'allocation-total'}><b>{totalAssigned ? `${sequence.length} / ${plan.nights}` : `${sequence.length} / ${plan.nights}`}</b><span>nights assigned</span></div></div>

      <div className="night-destination-list">
        {currentDestinationOptions.map((d) => {
          const selected = Object.entries(nightAssignments).filter(([,name])=>name===d.name).map(([n])=>Number(n)).sort((a,b)=>a-b);
          const open = openNightDestination===d.name;
          return <div className={`night-destination-row ${open?'open':''}`} key={d.name}>
            <div className="night-destination-name"><b>{d.name}</b><small>{destinationPriority(d.name)}</small></div>
            <button type="button" className="night-count-button" onClick={()=>setOpenNightDestination(open?null:d.name)}><strong>{selected.length}</strong><span>night{selected.length===1?'':'s'}</span></button>
            {open && <div className="night-picker-popover"><div className="night-picker-head"><b>Choose nights in {d.name}</b><span>Click to assign / move</span></div><div className="night-chip-grid">{Array.from({length:plan.nights},(_,i)=>i+1).map((n)=>{const active=nightAssignments[n]===d.name;return <button key={n} type="button" className={active?'night-chip active':'night-chip'} onClick={()=>toggleNight(d.name,n)}><span>Night</span><b>{n}</b></button>})}</div></div>}
          </div>;
        })}
      </div>

      <div className="add-destination-inline"><div><b>Add another overnight destination</b><span>Search the destination library, then choose its nights.</span></div><div className="destination-add-control"><Search size={14}/><input placeholder="Search destination" value={destinationSearch} onChange={(e)=>setDestinationSearch(e.target.value)}/><div className="destination-add-results">{allDestinationOptions.filter((d)=>!destinationSearch||d.name.toLowerCase().includes(destinationSearch.toLowerCase())).slice(0,10).map((d)=><button type="button" key={d.name} onClick={()=>{setNightAssignments((prev)=>{const firstFree=Array.from({length:plan.nights},(_,i)=>i+1).find((n)=>!prev[n]);return firstFree?{...prev,[firstFree]:d.name}:{...prev};});setOpenNightDestination(d.name);setDestinationSearch('')}}>{d.name}</button>)}</div></div></div>
      <div className="allocation-actions"><span>{sequenceChanged?'Unsaved night distribution':'Night distribution matches the itinerary'}</span><button type="button" className="primary-cta inline" disabled={!totalAssigned||!sequenceChanged} onClick={()=>{setNightSequence(sequence);setAppliedSequence(sequence)}}>Apply night distribution</button></div>
    </section>

    <div className="hotel-list refined-hotel-list">{rows.map((row) => {
      const sel = hotelSelections.find((x) => x.location === row.location); if (!sel) return null;
      const options = db.filter((h) => h.destination === row.location && packageMatch(h, input.hotelCategory));
      const search = (hotelSearch[row.location] || '').toLowerCase();
      const filteredOptions = options.filter((h) => !search || `${h.name} ${h.normalizedCategory} ${h.starRating || ''}`.toLowerCase().includes(search));
      const current = db.find((h) => h.id === sel.hotelId) || options[0];
      const roomCost = sel.nights * sel.rooms * sel.nightlyRate; const extraCost = sel.nights * sel.extraBeds * sel.extraBedRate; const cnbCost = sel.nights * sel.cnb * sel.cnbRate; const hasRate = sel.nightlyRate > 0;
      const mode=hotelMode[row.location]||'search';
      return <article className="hotel-card refined" key={row.location}>
        <div className="hotel-card-head"><div><span className="overline">{row.location}</span><h2>{sel.nights} night{sel.nights!==1?'s':''}</h2><p>{current?.sourceCategory||'Hotel database'} · {current?.rateValidity||'Rate validity not set'}</p></div><div className={hasRate?'stay-location-badge ok':'stay-location-badge warn'}>{hasRate?'B2B rate loaded':'B2B rate missing'}</div></div>
        <div className="hotel-picker-block"><div className="picker-copy"><label>Hotel selection</label><b>{sel.hotelName}</b><small>{current?.address||'Address not enriched'}{current?.roomType?` · ${current.roomType}`:''}{current?.starRating?` · ${current.starRating}★`:''}</small></div><div className="hotel-picker-actions">
          <div className="hotel-mode-tabs"><button type="button" className={mode==='search'?'active':''} onClick={()=>setHotelMode((x)=>({...x,[row.location]:'search'}))}>Search hotel</button><button type="button" className={mode==='custom'?'active':''} onClick={()=>setHotelMode((x)=>({...x,[row.location]:'custom'}))}>Custom hotel</button></div>
          {mode==='search'?<><input className="hotel-search-input" aria-label={`Search hotel for ${row.location}`} placeholder="Search hotel by name or category" value={hotelSearch[row.location]||''} onChange={(e)=>setHotelSearch((x)=>({...x,[row.location]:e.target.value}))}/><select aria-label={`Hotel for ${row.location}`} value={sel.hotelId} onChange={(e)=>replaceHotel(row.location,e.target.value)}><option value="">Select hotel...</option>{filteredOptions.map((h)=><option key={h.id} value={h.id}>{h.name} · {h.normalizedCategory}{h.starRating?` · ${h.starRating}★`:''}{h.mapB2B?` · ${money(h.mapB2B)}`:' · rate missing'}</option>)}</select><button type="button" className="edit-small" onClick={()=>setHotelMode((x)=>({...x,[row.location]:'custom'}))}>Can’t find it? Add a custom hotel <ChevronRight size={13}/></button></>:<div className="custom-hotel-panel"><label>Hotel name <input value={sel.hotelId?'':sel.hotelName==='Hotel to be added'?'':sel.hotelName} onChange={(e)=>setHotelMeta(row.location,{hotelId:'',hotelName:e.target.value||'Hotel to be added',status:e.target.value?'custom hotel name':'Hotel to be attached'})}/></label><label>Room / night <input type="number" min="0" value={Math.round(sel.nightlyRate)} onChange={(e)=>setHotelRate(row.location,'nightlyRate',+e.target.value||0)}/></label><label>Extra bed / night <input type="number" min="0" value={Math.round(sel.extraBedRate)} onChange={(e)=>setHotelRate(row.location,'extraBedRate',+e.target.value||0)}/></label><label>CNB / night <input type="number" min="0" value={Math.round(sel.cnbRate)} onChange={(e)=>setHotelRate(row.location,'cnbRate',+e.target.value||0)}/></label><button type="button" className="edit-small" onClick={()=>setHotelMode((x)=>({...x,[row.location]:'search'}))}>Back to hotel database</button></div>}
        </div></div>
        <div className="hotel-detail-grid"><section className="occupancy-card room-setup-card"><div className="small-card-head"><span>ROOM SETUP</span><b>Operator-controlled occupancy</b></div><div className="occupancy-mini-row"><span><UserRound size={11}/>{adults} adults</span><span><UsersRound size={11}/>{young} children</span></div><div className="room-setup-rows"><label><span>Rooms</span><Stepper value={sel.rooms||defaultRooms} min={1} onChange={(n)=>setHotelMeta(row.location,{rooms:n})}/></label><label><span>Extra beds</span><Stepper value={sel.extraBeds} min={0} onChange={(n)=>setHotelMeta(row.location,{extraBeds:n})}/></label><label><span>CNB</span><Stepper value={sel.cnb} min={0} onChange={(n)=>setHotelMeta(row.location,{cnb:n})}/></label></div><div className="room-setup-note">Suggested starting point: {defaultRooms} room{defaultRooms!==1?'s':''}{defaultExtra?` + ${defaultExtra} extra bed${defaultExtra!==1?'s':''}`:''}{defaultCnb?` + ${defaultCnb} CNB`:''}.</div></section>
          <section className="rate-card"><div className="small-card-head"><span>INTERNAL B2B RATES</span><b>Private operator view</b></div><div className="rate-rows"><label><span>MAP / room / night</span><div><b>₹</b><input type="number" min="0" value={Math.round(sel.nightlyRate)} onChange={(e)=>setHotelRate(row.location,'nightlyRate',+e.target.value||0)}/></div></label><label><span>Extra bed / night</span><div><b>₹</b><input type="number" min="0" value={Math.round(sel.extraBedRate)} onChange={(e)=>setHotelRate(row.location,'extraBedRate',+e.target.value||0)}/></div></label><label><span>CNB / night</span><div><b>₹</b><input type="number" min="0" value={Math.round(sel.cnbRate)} onChange={(e)=>setHotelRate(row.location,'cnbRate',+e.target.value||0)}/></div></label></div></section>
          <section className="stay-cost-card"><div className="small-card-head"><span>STAY COST</span><b>Internal B2B calculation</b></div><div className="stay-cost-breakdown"><div><span>Rooms</span><b>{money(roomCost)}</b><small>{sel.nights}N × {sel.rooms} room{sel.rooms!==1?'s':''}</small></div><div><span>Extra beds</span><b>{money(extraCost)}</b><small>{sel.nights}N × {sel.extraBeds} EB</small></div><div><span>CNB</span><b>{money(cnbCost)}</b><small>{sel.nights}N × {sel.cnb} CNB</small></div></div><div className="stay-total-row"><span>Total accommodation</span><strong>{money(roomCost+extraCost+cnbCost)}</strong></div></section>
        </div>
        <div className="hotel-card-foot refined-foot"><span><Info size={12}/>{sel.status}</span></div>
      </article>;
    })}</div>

    <div className="next-row"><Link className="secondary-link" href="/planner/itinerary"><ChevronLeft size={16}/> Back to itinerary</Link><div><b>Hotel layer complete?</b><span>Next, set markup and calculate the customer price.</span></div><Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
