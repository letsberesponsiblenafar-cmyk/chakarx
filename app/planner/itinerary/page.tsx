'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock3, FileText, Route } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { quotedActivityCost, tripActivities } from '@/lib/activities';
import { dayTitle } from '@/lib/narrative';
import { withPlanDestinations } from '@/lib/plan-destinations';
import type { DayPlan } from '@/lib/itinerary';
import { accommodationDayNarrative, hotelForNight, hotelStayLabel } from '@/lib/accommodation';
import './itinerary-refinement.css';

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function durationLabel(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60), remainder = rounded % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
}

function dayRoute(day: DayPlan) {
  const stops = day.dayTripDestination ? [day.from, day.dayTripDestination, day.stay]
    : day.label === 'Departure day' ? [day.from, ...(day.drive.via || []), day.to]
    : [day.from, ...(day.drive.via || []), day.stay];
  return stops.filter((stop, index) => index === 0 || stop !== stops[index - 1]).join(' → ');
}

function hasProgramme(day: DayPlan) {
  return Boolean(day.scheduledActivities?.length || day.blocks.some((block) =>
    !['arrival', 'departure', 'free-time'].includes(block.kind || '') && (block.sights !== undefined ? block.sights.length : Boolean(block.name))));
}

export default function ItineraryPage() {
  const { input, plan, destinationCatalog, hotelSelections, costModel, setDayContent } = usePlanner();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  if (!plan) return <AppShell><PlannerChrome title="Review your itinerary" eyebrow="STEP 04 · ITINERARY"><div className="empty-panel"><FileText size={28}/><h2>Build your journey first</h2><p>Choose the dates and route to see the day descriptions.</p><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const timedPlan = plan.dayPlans.every((day) => day.scheduledActivities !== undefined);
  const scheduledActivityKeys = new Set(plan.dayPlans.flatMap((day) => day.scheduledActivities?.map((activity) => activity.key) || []));
  const unscheduledActivities = timedPlan ? tripActivities(plan, destinationCatalog).filter((activity) =>
    quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) !== null && !scheduledActivityKeys.has(activity.key)) : [];
  const planningIssues = plan.dayPlans.flatMap((day) => (day.timing?.issues || []).map((message) => ({ day: day.day, message })));

  return <AppShell><PlannerChrome title="Review your itinerary" eyebrow="STEP 04 · ITINERARY">
    <section className="journey-intro itinerary-review-intro"><h2>A complete plan for every day.</h2><Link className="secondary-link" href="/planner/destinations">Review destinations <ChevronRight size={15}/></Link></section>
    {(planningIssues.length > 0 || unscheduledActivities.length > 0) && <aside className="itinerary-planning-alert" aria-label="Planning checks"><AlertTriangle size={19}/><div><b>Review these journey checks</b><p>These checks are for your team and do not appear in the client PDF.</p><ul>{planningIssues.map((issue, index) => <li key={`${issue.day}-${index}`}><strong>Day {issue.day}:</strong> {issue.message}</li>)}{unscheduledActivities.map((activity) => <li key={activity.key}><strong>{activity.destination}:</strong> {activity.name} is included in the price but has not been assigned to a day. Review the journey or adjust the activity selection.</li>)}</ul><Link href="/planner/activities-transport">Review activities &amp; transport <ChevronRight size={14}/></Link></div></aside>}
    <div className="itinerary-review-list">{plan.dayPlans.map((day) => {
      const hotel = hotelForNight(plan, hotelSelections, day.day);
      const editing = editingDay === day.day;
      const advisories = day.timing?.advisories || [];
      const suggested = accommodationDayNarrative(plan, hotelSelections, { ...day, customAbout: undefined }, input.pickup || 'Srinagar', costModel);
      const copy = accommodationDayNarrative(plan, hotelSelections, day, input.pickup || 'Srinagar', costModel);
      const title = withPlanDestinations(plan, () => dayTitle(day, input.pickup || 'Srinagar'));
      return <article className="itinerary-review-card" key={day.day}>
        <div className="itinerary-review-top"><div className="itinerary-review-number">{String(day.day).padStart(2, '0')}</div><div><span className="eyebrow">{displayDate(day.date)}</span><h3>{title}</h3><p>{day.label === 'Departure day' ? `Departure: ${day.to}${day.departureTime ? ` · ${day.departureTime}` : ''}` : `Overnight: ${hotel ? hotelStayLabel(hotel) : day.stay}${hotel?.hotelName && hotel.hotelName !== 'Hotel to be added' ? ` · ${hotel.hotelName}` : ''}`}</p></div><button type="button" className="secondary-link" onClick={() => setEditingDay(editing ? null : day.day)}>{editing ? 'Done' : 'Edit description'}</button></div>
        <div className="itinerary-day-context"><span><Route size={15}/>{dayRoute(day)}</span><span><Clock3 size={15}/>{durationLabel(day.timing?.driveMinutes ?? day.drive.hours * 60)} estimated driving{day.timing ? ` · ${durationLabel(day.timing.scheduledMinutes)} estimated visits & activities` : ''}</span></div>
        {advisories.length > 0 && <details className="itinerary-planning-estimates"><summary><Clock3 size={14}/>Planning estimates</summary><p>These estimates do not remove selected places. You can edit the day description below.</p><ul>{advisories.map((message, index) => <li key={index}>{message}</li>)}</ul></details>}
        {!hasProgramme(day) && day.label !== 'Departure day' && !day.transfer && <p className="itinerary-empty-programme"><AlertTriangle size={14}/>No visits are assigned to this day. Add a destination visit or an included activity before sharing.</p>}
        <div className="itinerary-review-copy"><span className="about-label">ABOUT THIS DAY</span>{editing ? <><textarea aria-label={`About day ${day.day}`} rows={5} value={day.customAbout ?? suggested} onChange={(event) => setDayContent(day.day, { about: event.target.value })}/><button type="button" className="itinerary-reset-copy" onClick={() => setDayContent(day.day, { about: null })}>Use library description</button></> : <p>{copy}</p>}</div>
        {day.previousCustomAbout && day.previousCustomAbout !== day.customAbout && <details className="itinerary-previous-copy"><summary>Previous description — review before reusing</summary><p>The programme changed, so the description above now follows the updated plan. Your previous wording is kept here for reference.</p><blockquote>{day.previousCustomAbout}</blockquote><button type="button" className="secondary-link" onClick={() => { setDayContent(day.day, { about: day.previousCustomAbout! }); setEditingDay(day.day); }}>Use this text and edit</button></details>}
      </article>;
    })}</div>
    <div className="next-row"><Link className="secondary-link" href="/planner/activities-transport"><ChevronLeft size={16}/> Back to activities &amp; transport</Link><div><b>Descriptions ready?</b><span>Review the full customer quote next.</span></div><Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link></div>
  </PlannerChrome></AppShell>;
}
