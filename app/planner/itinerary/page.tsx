'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Sparkles, ShieldCheck, Route as RouteIcon, CircleAlert, WalletCards, Plus } from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { destinations, routeByName, type Destination } from '@/lib/data';
import { destinationPriority } from '@/lib/intelligence';
import { dayNarrative, dayTitle } from '@/lib/narrative';
import { sameHotelDestination } from '@/lib/hotels';

function fmtDate(s: string) { return new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }); }
function routeHours(from: string, to: string) {
  if (from === to) return 0;
  const direct = routeByName(from,to);
  if (direct) return direct.hours;
  const viaA = routeByName(from,'Srinagar');
  const viaB = routeByName('Srinagar',to);
  return viaA && viaB ? viaA.hours + viaB.hours : 99;
}
function suggestedDestinations(current: string, hotelDatabase: { destination: string; mapB2B: number | null }[]) {
  const priorityRank: Record<string, number> = { CORE: 4, SECONDARY: 3, OFFBEAT: 2, LOW_PRIORITY: 1, TREK_ONLY: 0 };
  const popularOrder = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri', 'Gurez', 'Yusmarg', 'Achabal', 'Kokernag', 'Verinag', 'Manasbal', 'Naranag', 'Daksum'];
  return destinations.filter((d) => d.overnight_allowed).sort((a, b) => {
    const pa = destinationPriority(a.name), pb = destinationPriority(b.name);
    const popA = popularOrder.indexOf(a.name), popB = popularOrder.indexOf(b.name);
    const aHotels = hotelDatabase.filter((h) => sameHotelDestination(h.destination, a.name)); const bHotels = hotelDatabase.filter((h) => sameHotelDestination(h.destination, b.name));
    const score = (d: Destination, hs: typeof aHotels, pop: number, priority: string) =>
      (d.name === current ? -1000 : 0) + priorityRank[priority] * 100 + (pop >= 0 ? (50 - pop) : 0) + (hs.some((h) => !!h.mapB2B) ? 5 : hs.length ? 2 : 0);
    return score(b,bHotels,popB,pb)-score(a,aHotels,popA,pa) || a.name.localeCompare(b.name);
  });
}

export default function ItineraryPage() {
  const { input, plan, hotelSelections, hotelDatabase, setDayDestination, setDayTrip, setDeparturePoint, setDayContent, addDay, removeDay } = usePlanner();
  const [editDay, setEditDay] = useState<number | null>(null);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [destinationOpen, setDestinationOpen] = useState(false);
  if (!plan) return <AppShell><PlannerChrome title="Build your day-wise itinerary" eyebrow="STEP 01 · ITINERARY"><div className="empty-panel"><MapPin size={28}/><h2>Start with your trip details</h2><p>Go back to Build Your Trip, enter the traveller and date details, then continue.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;
  const hotelForStay=(stay:string)=>hotelSelections.find((h)=>h.location===stay);
  const attachedHotelCount=plan.stays.filter((s)=>{const h=hotelForStay(s.name);return Boolean(h?.hotelId||h?.hotelName&&h.hotelName!=='Hotel to be added')}).length;
  return <AppShell><PlannerChrome title="Day-wise itinerary" eyebrow="STEP 01 · ITINERARY">
    <section className="intelligence-banner"><div className="intelligence-banner-main"><div className="intelligence-icon"><Sparkles size={15}/></div><div><span className="eyebrow">CHAKAR INTELLIGENCE</span><b>Rule-driven itinerary active</b><p>Overnight state, destination priority, route preference, seasonal access and package boundaries are applied before the day plan is shown.</p></div></div><div className="intelligence-pills"><span><ShieldCheck size={11}/> Core-first</span><span><RouteIcon size={11}/> Hub routing</span><span><CircleAlert size={11}/> Live checks</span><span><WalletCards size={11}/> Clean costing</span></div></section>
    <section className="summary-ribbon"><div><span>Trip</span><b>{plan.days} days / {plan.nights} nights</b></div><div><span>Stay sequence</span><b>{plan.stays.map((s)=>`${s.name} ${s.nights}N`).join(' → ')}</b></div><div><span>Hotel attachment</span><b>{attachedHotelCount}/{plan.stays.length} stays</b></div><div><span>Planning load</span><b>{plan.travelLoad}</b></div></section>
    <div className="section-title itinerary-section-title"><div><span className="eyebrow">YOUR ITINERARY</span><h2>Days, destinations and local sightseeing.</h2><p>Choose each night’s hotel base separately from the places visited during the day. Set the departure location on the final day.</p></div></div>
    <div className="itinerary-list">
      {plan.dayPlans.map((d)=>{
        const hotel=hotelForStay(d.stay);
        const isDeparture=d.label==='Departure day';
        const isEditing=editDay===d.day;
        const title=dayTitle(d, input.pickup || 'Srinagar');
        const about=dayNarrative(d, input.pickup || 'Srinagar');
        const choices=suggestedDestinations(d.stay,hotelDatabase).filter((x)=>!destinationSearch||x.name.toLowerCase().includes(destinationSearch.toLowerCase()));
        return <article className={`itinerary-card redesigned-day ${isEditing?'editing':''}`} key={d.day}>
          <div className="day-title redesigned">
            <div className="day-heading-editable">
              <span className="day-number large">DAY {String(d.day).padStart(2,'0')}</span>
              {isEditing ? <input className="inline-day-title" aria-label={`Day ${d.day} title`} value={d.customTitle ?? title} onChange={(e)=>setDayContent(d.day,{title:e.target.value})}/> : <h3>{title}</h3>}
              <p className="day-date">{fmtDate(d.date)} · {isDeparture?'Departure day':d.transfer?'Transfer day':'Explore day'}</p>
            </div>
            <div className="day-actions"><button className="edit-button" onClick={()=>{setEditDay(isEditing?null:d.day);setDestinationSearch('');setDestinationOpen(false)}}>{isEditing?'Done':'Edit day'}</button><button className="edit-button danger" type="button" onClick={()=>removeDay(d.day)} disabled={plan.nights<=1}>Remove day</button></div>
          </div>

          <section className="day-about">
            <span className="about-label">ABOUT THIS DAY</span>
            {isEditing ? <textarea className="inline-day-about" aria-label="About this day" rows={4} value={d.customAbout ?? about} onChange={(e)=>setDayContent(d.day,{about:e.target.value})}/> : <p>{about}</p>}
          </section>

          <div className="stay-attach redesigned-hotel">
            <div className="stay-attach-icon"><MapPin size={15}/></div>
            <div className="overnight-inline-edit">
              <span>{isDeparture?'Departure point':'Overnight destination'}</span>
              {isEditing && !isDeparture ? <div className="destination-inline-control">
                <button type="button" className="destination-toggle" aria-expanded={destinationOpen} aria-controls={`destination-options-${d.day}`} onClick={()=>setDestinationOpen((open)=>!open)}>{d.stay}<ChevronRight size={15} className={destinationOpen?'destination-chevron open':'destination-chevron'}/></button>
                {destinationOpen && <div className="destination-name-list" id={`destination-options-${d.day}`}>
                  <input aria-label="Find overnight destination" placeholder="Search destinations" value={destinationSearch} onChange={(e)=>setDestinationSearch(e.target.value)} onKeyDown={(e)=>{if(e.key==='Escape'){setDestinationOpen(false);setDestinationSearch('')}}}/>
                  <div className="destination-options">{choices.length ? choices.map((x:Destination)=><button type="button" key={x.name} className={x.name===d.stay?'selected':''} onClick={()=>{setDayDestination(d.day,x.name);setDestinationSearch('');setDestinationOpen(false)}}>{x.name}</button>) : <p>No matching destination</p>}</div>
                </div>}
              </div> : isEditing && isDeparture ? <select className="day-location-select" aria-label="Departure location" value={d.to} onChange={(e)=>setDeparturePoint(e.target.value)}>{['Srinagar', ...destinations.filter((x)=>x.overnight_allowed && x.name!=='Srinagar').map((x)=>x.name), 'Jammu'].map((place)=><option key={place} value={place}>{place}</option>)}</select> : <b>{isDeparture?d.to:d.stay}</b>}
            </div>
            <div className="hotel-inline-summary"><span>{isDeparture?'Previous night’s hotel':'Hotel'}</span><b>{hotel?.hotelName||'Hotel to be attached'}</b><small>{hotel?.status||'Select or type the hotel in the Hotels step.'}</small></div>
            <Link href="/planner/hotels" className="stay-manage">Manage hotel <ChevronRight size={13}/></Link>
          </div>
          {!isDeparture && <div className="day-visit-control"><div><span className="about-label">DAY VISIT</span><b>{d.dayTripDestination ? `${d.dayTripDestination} by day · ${d.stay} overnight` : `${d.stay}${d.stay==='Srinagar'?' local':''} sightseeing · ${d.stay} overnight`}</b><small>{d.day===1 && d.dayTripDestination ? 'Arrival-day excursion requires an early arrival. Confirm arrival time before promising this visit.' : 'Visiting a place does not move the hotel or next morning’s starting point.'}</small></div>{isEditing && <select aria-label={`Day ${d.day} sightseeing destination`} value={d.dayTripDestination || ''} onChange={(e)=>setDayTrip(d.day,e.target.value || null)}><option value="">{d.stay==='Srinagar'?'Srinagar local sightseeing':'Stay destination sightseeing'} only</option>{destinations.filter((x)=>x.name!==d.stay && (x.name===d.dayTripDestination || routeHours(d.from,x.name)+routeHours(x.name,d.stay)<=6)).map((place)=><option key={place.name} value={place.name}>{place.name} day visit</option>)}</select>}</div>}
          <div className="day-intelligence-row"><span className={`route-policy-chip ${d.drive.preference.toLowerCase()}`}>{d.drive.preference}</span>{d.drive.vehicleDaysCharged>1&&<span className="route-policy-chip warn">{d.drive.vehicleDaysCharged} vehicle days</span>}{d.drive.preferredAlternative&&<span className="route-policy-chip">Compare {d.drive.preferredAlternative}</span>}{d.drive.live_required&&<span className="route-policy-chip live">Live route check</span>}<span className="overnight-state">{isDeparture?`Departure transfer: ${d.from} → ${d.to} · No overnight stay`:`Overnight: ${d.stay} · Next-day origin: ${d.stay}`}</span></div>
        </article>;
      })}
    </div>
    <div className="day-management"><div><span className="eyebrow">ITINERARY CONTROL</span><b>{plan.days} days · {plan.nights} nights</b><small>Add or remove a full itinerary day. The night allocation and hotel layer update together.</small></div><button className="secondary-link" type="button" onClick={addDay} disabled={plan.nights>=30}><Plus size={14}/> Add full day</button></div>
    <div className="next-row"><Link className="secondary-link" href="/"><ChevronLeft size={16}/> Back to Build Your Trip</Link><div><b>Itinerary complete?</b><span>Next, attach hotels and finalize occupancy.</span></div><Link className="primary-cta inline" href="/planner/hotels">Next: Hotels <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
