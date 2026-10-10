'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { enabledSightseeing } from '@/lib/data';
import { dayNarrative, dayTitle } from '@/lib/narrative';

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ItineraryPage() {
  const { input, plan, destinationCatalog, hotelSelections, costModel, setDayContent } = usePlanner();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  if (!plan) return <AppShell><PlannerChrome title="Review your itinerary" eyebrow="STEP 04 · ITINERARY"><div className="empty-panel"><FileText size={28}/><h2>Build your journey first</h2><p>Choose the dates and route to see the day descriptions.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const visited = new Set(plan.dayPlans.filter((day) => day.label !== 'Departure day').flatMap((day) => [day.stay, day.dayTripDestination].filter((name): name is string => Boolean(name))));
  const scheduled = new Set(plan.dayPlans.flatMap((day) => day.blocks.flatMap((block) =>
    block.sights?.length ? block.sights.map((name) => `${block.destination}::${name}`) : block.destination ? [`${block.destination}::${block.name}`] : [])));
  const unscheduled = destinationCatalog.filter((destination) => visited.has(destination.name)).map((destination) => ({
    name: destination.name,
    places: enabledSightseeing(destination).filter((name) => !scheduled.has(`${destination.name}::${name}`)),
  })).filter((item) => item.places.length);
  const unscheduledCount = unscheduled.reduce((sum, item) => sum + item.places.length, 0);

  return <AppShell><PlannerChrome title="Review your itinerary" eyebrow="STEP 04 · ITINERARY">
    <section className="journey-intro itinerary-review-intro"><div><span className="eyebrow">DAY-WISE COPY</span><h2>The route is ready. Refine the story.</h2><p>Destinations, overnight stays, hotels and activities are carried through from the earlier steps. Here, edit only the description the client will read for each day.</p></div><Link className="secondary-link" href="/planner/destinations">Review destinations <ChevronRight size={15}/></Link></section>
    {unscheduledCount > 0 && <details className="itinerary-unscheduled"><summary>{unscheduledCount} selected {unscheduledCount === 1 ? 'place is' : 'places are'} not scheduled</summary><p>The route includes only what fits the chosen days and current planning rules. These places stay out of the client PDF unless you add time, change the journey, or quote an activity they require:</p>{unscheduled.map((item) => <div key={item.name}><b>{item.name}</b><span>{item.places.join(' · ')}</span></div>)}</details>}
    <div className="itinerary-review-list">{plan.dayPlans.map((day) => {
      const hotel = hotelSelections.find((stay) => stay.location === day.stay);
      const editing = editingDay === day.day;
      const suggested = dayNarrative({ ...day, customAbout: undefined }, input.pickup || 'Srinagar', costModel);
      const copy = dayNarrative(day, input.pickup || 'Srinagar', costModel);
      return <article className="itinerary-review-card" key={day.day}>
        <div className="itinerary-review-top"><div className="itinerary-review-number">{String(day.day).padStart(2, '0')}</div><div><span className="eyebrow">{displayDate(day.date)}</span><h3>{dayTitle(day, input.pickup || 'Srinagar')}</h3><p>{day.label === 'Departure day' ? `Departure from ${day.to}` : `${day.dayTripDestination ? `${day.dayTripDestination} day visit · ` : ''}${day.stay} overnight${hotel?.hotelName && hotel.hotelName !== 'Hotel to be added' ? ` · ${hotel.hotelName}` : ''}`}</p></div><button type="button" className="secondary-link" onClick={() => setEditingDay(editing ? null : day.day)}>{editing ? 'Done' : 'Edit description'}</button></div>
        <div className="itinerary-review-copy"><span className="about-label">ABOUT THIS DAY</span>{editing ? <><textarea aria-label={`About day ${day.day}`} rows={5} value={day.customAbout ?? suggested} onChange={(event) => setDayContent(day.day, { about: event.target.value })}/><button type="button" className="itinerary-reset-copy" onClick={() => setDayContent(day.day, { about: suggested })}>Use suggested description</button></> : <p>{copy}</p>}</div>
      </article>;
    })}</div>
    <div className="next-row"><Link className="secondary-link" href="/planner/activities-transport"><ChevronLeft size={16}/> Back to activities &amp; transport</Link><div><b>Descriptions ready?</b><span>Review the full customer quote next.</span></div><Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
