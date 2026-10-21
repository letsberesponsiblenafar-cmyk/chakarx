'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock3, MapPin, Moon, ArrowRight } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import SearchableDestinationSelect from '@/components/SearchableDestinationSelect';
import ItineraryDataUpdate from '@/components/ItineraryDataUpdate';
import { usePlanner } from '@/components/PlannerProvider';
import { routeByName } from '@/lib/data';
import { ROUTE_VERSION, requiresSrinagarFinalNight } from '@/lib/itinerary';
import { dayVisitDestination } from '@/lib/journey-labels';
import { dayTitle } from '@/lib/narrative';
import { planDestinations, withPlanDestinations } from '@/lib/plan-destinations';
import { dayTimingForReview, pickupTimingNotice } from '@/lib/day-scheduler';
import '../destination-refinement.css';

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

function duration(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return hours ? `${hours} hr${hours === 1 ? '' : 's'}${remaining ? ` ${remaining} min` : ''}` : `${remaining} min`;
}

export default function DestinationsPage() {
  const { plan, routeVersion, destinationCatalog: currentCatalog, destinationConnection, replanDestinations, setDayDestination, setDayTrip, setDeparturePoint } = usePlanner();
  const destinationCatalog = plan ? planDestinations(plan, currentCatalog) : currentCatalog;
  if (!plan) return <AppShell><PlannerChrome title="Choose your journey" eyebrow="STEP 01 · DESTINATIONS"><div className="empty-panel"><MapPin size={28}/><h2>Start with your trip details</h2><p>Choose your dates and travellers first to see a suggested day-by-day route.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const overnightOptions = destinationCatalog.filter((place) => place.overnight_allowed).sort((a, b) => a.name.localeCompare(b.name));
  const visited = [...new Set(plan.dayPlans.slice(0, plan.nights).map(dayVisitDestination))];

  return <AppShell><PlannerChrome title="Choose your journey" eyebrow="STEP 01 · DESTINATIONS"><div className="journey-refinement">
    <ItineraryDataUpdate/>
    {routeVersion !== ROUTE_VERSION && <section className="route-update-banner"><div><b>More balanced route suggestions are available.</b><p>Rebuild the destinations and day descriptions for this trip. Hotels and agreed rates for retained stays, your vehicle, and activities at retained destinations are kept; totals follow the new night allocation.</p></div><button type="button" className="secondary-link" disabled={destinationConnection !== 'ready'} onClick={replanDestinations}>Rebuild suggestions</button></section>}
    {requiresSrinagarFinalNight(plan.input) && <p className="journey-time-line" role="note"><Moon size={14} aria-hidden="true"/><span>Departure at {plan.input.departureTime}: the final hotel night is in Srinagar. You can still choose a day visit before returning for the night.</span></p>}

    <div className="journey-days">{plan.dayPlans.map((day) => {
      const departure = day.day > plan.nights;
      const finalNightLocked = day.day === plan.nights && requiresSrinagarFinalNight(plan.input);
      const visit = dayVisitDestination(day);
      const visits = [...destinationCatalog].sort((a, b) => {
        const rank = (name: string) => name === day.stay ? 0 : name === visit ? 1 : visited.includes(name) ? 2 : 3;
        return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
      });
      const title = dayTitle(day, plan.input.pickup || 'Srinagar');
      const timing = withPlanDestinations(plan, () => dayTimingForReview(day, plan.input));
      const pickupNotice = pickupTimingNotice(day, plan.input);
      const driveMinutes = timing?.driveMinutes ?? day.drive.hours * 60;
      const timingIssues = timing?.issues || [];
      return <article className="journey-day" key={day.day}>
        <div className="journey-day-index"><span>DAY</span><strong>{String(day.day).padStart(2, '0')}</strong></div>
        <div className="journey-day-main"><div className="journey-day-heading"><div><h3>Day {day.day} — {title}</h3><span>{displayDate(day.date)}{day.day === 1 ? ' · Arrival day' : departure ? ' · Final day' : ''}</span></div><span className={departure ? 'journey-kind departure' : day.dayTripDestination ? 'journey-kind' : 'journey-kind overnight'}>{departure ? 'Departure' : day.dayTripDestination ? day.from === day.stay ? 'Return to hotel base' : 'Continue to hotel base' : 'Overnight stay'}</span></div>
          <div className={`journey-route-line${departure ? ' is-departure' : ''}`} aria-label={departure ? `Start in ${day.from}, depart from ${day.to}` : `Start in ${day.from}, visit ${visit}, overnight in ${day.stay}`}>
            <div><span>{day.day === 1 ? 'ARRIVE / START' : 'START'}</span><strong>{day.from}</strong></div><ArrowRight aria-hidden="true" size={16}/>
            <div><span>{departure ? 'DEPART FROM' : 'EXPLORE'}</span><strong>{departure ? day.to : visit}</strong></div>
            {!departure && <><ArrowRight aria-hidden="true" size={16}/><div><span><Moon size={11} aria-hidden="true"/> OVERNIGHT</span><strong>{day.stay}</strong></div></>}
          </div>
          <div className="journey-time-line"><Clock3 size={14} aria-hidden="true"/><span>{pickupNotice ? 'Custom pickup · confirm travel time. PDF download remains available.' : day.drive.known === false && !driveMinutes ? 'Add a driving estimate in the destination library' : driveMinutes > 0 ? `Estimated driving · ${duration(driveMinutes)}${day.dayTripDestination && day.from === day.stay ? ' round trip' : ' total'}${day.drive.via?.length ? ` · via ${day.drive.via.join(' → ')}` : ''}` : 'Explore within the destination'}</span></div>
          {departure ? <div className="journey-choice single"><label htmlFor="departure-point">Departure point</label><SearchableDestinationSelect id="departure-point" label="Departure point" value={day.to} onChange={setDeparturePoint} options={['Srinagar', ...overnightOptions.filter((place) => place.name !== 'Srinagar').map((place) => place.name), 'Jammu'].map((name) => ({ value: name, label: name }))}/><small>No hotel night on the departure day. Any sightseeing fits around the departure time.</small></div> : <div className="journey-choices"><div className="journey-choice"><label htmlFor={`visit-${day.day}`}><MapPin size={13} aria-hidden="true"/> Destination to explore</label><SearchableDestinationSelect id={`visit-${day.day}`} label="Destination to explore" value={visit} onChange={(name) => setDayTrip(day.day, name)} options={visits.map((place) => {
              const travel = hoursBetween(day.from, place.name) + hoursBetween(place.name, day.stay);
              return { value: place.name, label: `${place.name}${travel >= 99 ? ' · timing needed' : travel > 6 ? ' · long journey' : ''}` };
            })}/><small>{visit !== day.stay ? `Sightseeing in ${visit}, followed by ${day.from === day.stay ? 'a return' : 'the transfer'} to ${day.stay} for the night.` : `Sightseeing in ${visit}, where you also stay.`}</small></div><div className="journey-choice"><label htmlFor={`overnight-${day.day}`}><Moon size={13} aria-hidden="true"/> Hotel base for the night</label><SearchableDestinationSelect id={`overnight-${day.day}`} label="Hotel base for the night" value={day.stay} disabled={finalNightLocked} onChange={(nextStay) => { setDayDestination(day.day, nextStay); if (visit !== nextStay) setDayTrip(day.day, visit); }} options={overnightOptions.map((place) => ({ value: place.name, label: place.name }))}/><small>{finalNightLocked ? 'Required in Srinagar for departure at or before 2 pm.' : day.day < plan.nights ? `Day ${day.day + 1} starts from ${day.stay}.` : `Departure day starts from ${day.stay}.`}</small></div></div>}
          {timingIssues.length > 0 && <details className="journey-timing-review"><summary>Review this day’s timing</summary><ul>{timingIssues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></details>}
        </div>
      </article>;
    })}</div>

    <div className="next-row"><Link className="secondary-link" href="/"><ChevronLeft size={16}/> Back to trip details</Link><div><b>Route selected</b><span>Next, choose the hotels for these overnight stays.</span></div><Link className="primary-cta inline" href="/planner/hotels">Next: Hotels <ChevronRight size={16}/></Link></div>
  </div></PlannerChrome></AppShell>;
}
