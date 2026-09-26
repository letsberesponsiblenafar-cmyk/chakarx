'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Sparkles, ShieldCheck, Route as RouteIcon, CircleAlert, WalletCards, Plus } from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { destinations, type Destination } from '@/lib/data';
import { destinationPriority, routePreference } from '@/lib/intelligence';

function fmtDate(s: string) { return new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }); }
function inputPickup(value?: string) { return value?.trim() || 'the selected arrival point'; }
function aboutFor(d?: Destination, day?: any) {
  if (day?.customAbout?.trim()) return day.customAbout.trim();
  if (!d) return 'A flexible day shaped around the destination, local character and the traveller’s selected route.';
  if (day?.day === 1) {
    const pickup = inputPickup(day.__pickup);
    return `Arrival in ${pickup}, followed by the planned onward movement and time for local sightseeing around ${d.name}. ${d.description}`;
  }
  return d.description;
}
function defaultTitle(day: any, pickup: string) {
  if (day.day === 1) return day.stay.toLowerCase() === pickup.toLowerCase() ? `Arrival in ${day.stay} & local sightseeing` : `Arrival in ${pickup} & ${day.stay} local sightseeing`;
  if (day.label === 'Departure day') return `Departure from ${day.stay}`;
  return day.stay;
}
function suggestedDestinations(current: string, hotelDatabase: { destination: string; mapB2B: number | null }[]) {
  const priorityRank: Record<string, number> = { CORE: 4, SECONDARY: 3, OFFBEAT: 2, LOW_PRIORITY: 1, TREK_ONLY: 0 };
  const popularOrder = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri', 'Gurez', 'Yusmarg', 'Achabal', 'Kokernag', 'Verinag', 'Manasbal', 'Naranag', 'Daksum'];
  return destinations.filter((d) => d.overnight_allowed).sort((a, b) => {
    const pa = destinationPriority(a.name), pb = destinationPriority(b.name);
    const popA = popularOrder.indexOf(a.name), popB = popularOrder.indexOf(b.name);
    const aHotels = hotelDatabase.filter((h) => h.destination === a.name); const bHotels = hotelDatabase.filter((h) => h.destination === b.name);
    const score = (d: Destination, hs: typeof aHotels, pop: number, priority: string) =>
      (d.name === current ? -1000 : 0) + priorityRank[priority] * 100 + (pop >= 0 ? (50 - pop) : 0) + (hs.some((h) => !!h.mapB2B) ? 5 : hs.length ? 2 : 0);
    return score(b,bHotels,popB,pb)-score(a,aHotels,popA,pa) || a.name.localeCompare(b.name);
  });
}

export default function ItineraryPage() {
  const { input, plan, hotelSelections, hotelDatabase, setDayDestination, setDayContent, addDay, removeDay } = usePlanner();
  const [editDay, setEditDay] = useState<number | null>(null);
  const [destinationSearch, setDestinationSearch] = useState('');
  if (!plan) return <AppShell><PlannerChrome title="Build your day-wise itinerary" eyebrow="STEP 01 · ITINERARY"><div className="empty-panel"><MapPin size={28}/><h2>Start with your trip details</h2><p>Go back to Build Your Trip, enter the traveller and date details, then continue.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;
  const hotelForStay=(stay:string)=>hotelSelections.find((h)=>h.location===stay);
  const attachedHotelCount=plan.stays.filter((s)=>{const h=hotelForStay(s.name);return Boolean(h?.hotelId||h?.hotelName&&h.hotelName!=='Hotel to be added')}).length;
  return <AppShell><PlannerChrome title="Day-wise itinerary" eyebrow="STEP 01 · ITINERARY">
    <section className="intelligence-banner"><div className="intelligence-banner-main"><div className="intelligence-icon"><Sparkles size={15}/></div><div><span className="eyebrow">CHAKAR INTELLIGENCE</span><b>Rule-driven itinerary active</b><p>Overnight state, destination priority, route preference, seasonal access and package boundaries are applied before the day plan is shown.</p></div></div><div className="intelligence-pills"><span><ShieldCheck size={11}/> Core-first</span><span><RouteIcon size={11}/> Hub routing</span><span><CircleAlert size={11}/> Live checks</span><span><WalletCards size={11}/> Clean costing</span></div></section>
    <section className="summary-ribbon"><div><span>Trip</span><b>{plan.days} days / {plan.nights} nights</b></div><div><span>Stay sequence</span><b>{plan.stays.map((s)=>`${s.name} ${s.nights}N`).join(' → ')}</b></div><div><span>Hotel attachment</span><b>{attachedHotelCount}/{plan.stays.length} stays</b></div><div><span>Planning load</span><b>{plan.travelLoad}</b></div></section>
    <div className="section-title itinerary-section-title"><div><span className="eyebrow">YOUR ITINERARY</span><h2>Days, destinations and local sightseeing.</h2><p>Edit each day directly in place. Changing the overnight destination automatically refreshes the destination story and arrival flow.</p></div></div>
    <div className="itinerary-list">
      {plan.dayPlans.map((d)=>{
        const hotel=hotelForStay(d.stay);
        const isEditing=editDay===d.day;
        const selectedDest=destinations.find((x)=>x.name===d.stay);
        const title=d.customTitle?.trim() || defaultTitle(d, input.pickup || 'Srinagar');
        const about=aboutFor(selectedDest, {...d, __pickup: input.pickup});
        const choices=suggestedDestinations(d.stay,hotelDatabase).filter((x)=>!destinationSearch||x.name.toLowerCase().includes(destinationSearch.toLowerCase()));
        return <article className={`itinerary-card redesigned-day ${isEditing?'editing':''}`} key={d.day}>
          <div className="day-title redesigned">
            <div className="day-heading-editable">
              <span className="day-number large">DAY {String(d.day).padStart(2,'0')}</span>
              {isEditing ? <input className="inline-day-title" aria-label="Day heading" value={d.customTitle ?? title} onChange={(e)=>setDayContent(d.day,{title:e.target.value})}/> : <h3>{title}</h3>}
              <p className="day-date">{fmtDate(d.date)} · {d.transfer?'Transfer day':'Explore day'}</p>
            </div>
            <div className="day-actions"><button className="edit-button" onClick={()=>{setEditDay(isEditing?null:d.day);setDestinationSearch('')}}>{isEditing?'Done':'Edit day'}</button><button className="edit-button danger" type="button" onClick={()=>removeDay(d.day)} disabled={plan.nights<=1}>Remove day</button></div>
          </div>

          <section className="day-about">
            <span className="about-label">ABOUT THIS DAY</span>
            {isEditing ? <textarea className="inline-day-about" aria-label="About this day" rows={4} value={d.customAbout ?? about} onChange={(e)=>setDayContent(d.day,{about:e.target.value})}/> : <p>{about}</p>}
          </section>

          <div className="stay-attach redesigned-hotel">
            <div className="stay-attach-icon"><MapPin size={15}/></div>
            <div className="overnight-inline-edit"><span>Overnight destination</span>{isEditing ? <div className="destination-inline-control"><input aria-label="Find overnight destination" placeholder="Search destination" value={destinationSearch} onChange={(e)=>setDestinationSearch(e.target.value)}/><div className="destination-name-list">{choices.slice(0,14).map((x:Destination)=><button type="button" key={x.name} className={x.name===d.stay?'selected':''} onClick={()=>{setDayDestination(d.day,x.name);setDestinationSearch('')}}>{x.name}</button>)}</div></div> : <b>{d.stay}</b>}</div>
            <div className="hotel-inline-summary"><span>Hotel</span><b>{hotel?.hotelName||'Hotel to be attached'}</b><small>{hotel?.status||'Select or type the hotel in the Hotels step.'}</small></div>
            <Link href="/planner/hotels" className="stay-manage">Manage hotel <ChevronRight size={13}/></Link>
          </div>
          <div className="day-intelligence-row"><span className={`route-policy-chip ${d.drive.preference.toLowerCase()}`}>{d.drive.preference}</span>{d.drive.vehicleDaysCharged>1&&<span className="route-policy-chip warn">{d.drive.vehicleDaysCharged} vehicle days</span>}{d.drive.preferredAlternative&&<span className="route-policy-chip">Compare {d.drive.preferredAlternative}</span>}{d.drive.live_required&&<span className="route-policy-chip live">Live route check</span>}<span className="overnight-state">Overnight: {d.stay} · Next-day origin: {d.stay}</span></div>
        </article>;
      })}
    </div>
    <div className="day-management"><div><span className="eyebrow">ITINERARY CONTROL</span><b>{plan.days} days · {plan.nights} nights</b><small>Add or remove a full itinerary day. The night allocation and hotel layer update together.</small></div><button className="secondary-link" type="button" onClick={addDay} disabled={plan.nights>=30}><Plus size={14}/> Add full day</button></div>
    <div className="next-row"><Link className="secondary-link" href="/"><ChevronLeft size={16}/> Back to Build Your Trip</Link><div><b>Itinerary complete?</b><span>Next, attach hotels and finalize occupancy.</span></div><Link className="primary-cta inline" href="/planner/hotels">Next: Hotels <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
