'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { routeByName } from '@/lib/data';
import { ROUTE_VERSION } from '@/lib/itinerary';

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function hoursBetween(from: string, to: string) {
  if (from === to) return 0;
  const direct = routeByName(from, to);
  if (direct) return direct.hours;
  const first = routeByName(from, 'Srinagar');
  const second = routeByName('Srinagar', to);
  return first && second ? first.hours + second.hours : 99;
}

export default function DestinationsPage() {
  const { plan, routeVersion, destinationCatalog, generate, setDayDestination, setDayTrip, setDeparturePoint } = usePlanner();
  if (!plan) return <AppShell><PlannerChrome title="Choose your journey" eyebrow="STEP 01 · DESTINATIONS"><div className="empty-panel"><MapPin size={28}/><h2>Start with your trip details</h2><p>Choose your dates and travellers first to see a suggested day-by-day route.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const overnightOptions = destinationCatalog.filter((place) => place.overnight_allowed).sort((a, b) => a.name.localeCompare(b.name));
  const visited = [...new Set(plan.dayPlans.slice(0, plan.nights).map((day) => day.dayTripDestination || day.stay))];

  return <AppShell><PlannerChrome title="Choose your journey" eyebrow="STEP 01 · DESTINATIONS">
    {routeVersion !== ROUTE_VERSION && <section className="route-update-banner"><div><b>New route suggestions are available.</b><p>Rebuilding will replace the route and hotel choices in this draft.</p></div><button type="button" className="secondary-link" onClick={() => generate()}>Rebuild suggestions</button></section>}
    <section className="journey-intro"><div><span className="eyebrow">YOUR SUGGESTED ROUTE</span><h2>One choice for the day. One place for the night.</h2><p>We have suggested the places below. Change the visit or overnight base for any day; the next day’s route and hotel stays update with it.</p></div><div className="journey-intro-count"><strong>{plan.days}</strong><span>days · {plan.nights} nights</span></div></section>

    <div className="journey-days">{plan.dayPlans.map((day) => {
      const departure = day.day > plan.nights;
      const visit = day.dayTripDestination || day.stay;
      const visits = destinationCatalog.filter((place) => place.name === visit || place.name === day.stay || hoursBetween(day.from, place.name) + hoursBetween(place.name, day.stay) <= 6).sort((a, b) => {
        const rank = (name: string) => name === day.stay ? 0 : name === visit ? 1 : visited.includes(name) ? 2 : 3;
        return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
      });
      return <article className="journey-day" key={day.day}>
        <div className="journey-day-index"><span>DAY</span><strong>{String(day.day).padStart(2, '0')}</strong></div>
        <div className="journey-day-main"><div className="journey-day-heading"><div><h3>{departure ? 'Departure' : day.dayTripDestination ? `${day.dayTripDestination} day visit` : `${day.stay} sightseeing`}</h3><span>{displayDate(day.date)}{day.day === 1 ? ' · Arrival' : departure ? ' · Final day' : ''}</span></div><span className={departure ? 'journey-kind departure' : day.dayTripDestination ? 'journey-kind' : 'journey-kind overnight'}>{departure ? 'No overnight' : day.dayTripDestination ? 'Day visit' : 'Stay & explore'}</span></div>
          {departure ? <div className="journey-choice single"><label htmlFor="departure-point">Departure from</label><select id="departure-point" value={day.to} onChange={(event) => setDeparturePoint(event.target.value)}>{['Srinagar', ...overnightOptions.filter((place) => place.name !== 'Srinagar').map((place) => place.name), 'Jammu'].map((name) => <option key={name} value={name}>{name}</option>)}</select><small>Departure has no hotel night.</small></div> : <div className="journey-choices"><div className="journey-choice"><label htmlFor={`visit-${day.day}`}>Visit / sightseeing</label><select id={`visit-${day.day}`} value={visit} onChange={(event) => setDayTrip(day.day, event.target.value === day.stay ? null : event.target.value)}>{visits.map((place) => <option key={place.name} value={place.name}>{place.name}{place.name === day.stay ? ' · sightseeing' : ''}</option>)}</select></div><div className="journey-choice"><label htmlFor={`overnight-${day.day}`}>Overnight in</label><select id={`overnight-${day.day}`} value={day.stay} onChange={(event) => { const nextStay = event.target.value; setDayDestination(day.day, nextStay); if (visit !== nextStay) setDayTrip(day.day, visit); }}>{overnightOptions.map((place) => <option key={place.name} value={place.name}>{place.name}</option>)}</select></div></div>}
        </div>
      </article>;
    })}</div>

    <div className="next-row"><Link className="secondary-link" href="/"><ChevronLeft size={16}/> Back to trip details</Link><div><b>Route selected</b><span>Next, choose the hotels for these overnight stays.</span></div><Link className="primary-cta inline" href="/planner/hotels">Next: Hotels <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
