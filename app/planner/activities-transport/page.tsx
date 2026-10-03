'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Route } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { transportOptions } from '@/lib/data';
import { quotedActivityCost, tripActivities } from '@/lib/activities';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }

export default function ActivitiesTransportPage() {
  const { plan, input, costModel, setCostModel, setTransport, setCustomTransport, destinationCatalog, hydrated } = usePlanner();

  if (!hydrated) return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel"><Route size={28}/><h2>Loading your journey…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel"><Route size={28}/><h2>Create the itinerary first.</h2><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const activities = tripActivities(plan, destinationCatalog);
  const includedCount = activities.filter((activity) => quotedActivityCost(costModel.activityCosts, activity) !== null).length;
  const activityTotal = activities.reduce((sum, activity) => sum + (quotedActivityCost(costModel.activityCosts, activity) ?? 0), 0);
  const chargedDays = plan.dayPlans.length;
  const customVehicleMissing = costModel.transportIsCustom && !input.transport.trim();
  const people = input.adults + input.youngAges.length;

  function setActivityCost(key: string, raw: string) {
    const activityCosts = { ...(costModel.activityCosts || {}) };
    if (raw.trim() === '') delete activityCosts[key];
    else if (Number.isFinite(Number(raw)) && Number(raw) >= 0) activityCosts[key] = Number(raw);
    setCostModel({ activityCosts });
  }

  return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT">
    <div className="page-callout refined"><div><b>Set the journey services before pricing.</b><span>Choose a vehicle and quote activities for the whole travelling group. These amounts flow directly into Costing and the client PDF.</span></div></div>

    <section className="transport-setup-card"><div><span className="overline">01 · TRANSPORT</span><h2>Choose your vehicle</h2><p>The daily rate covers {chargedDays} service days in this itinerary. Enter a custom vehicle if the listed options do not fit this group.</p></div>
      <div className="transport-setup-fields"><label>Vehicle<select aria-label="Choose your vehicle" value={costModel.transportIsCustom ? 'Other' : input.transport} onChange={(event) => event.target.value === 'Other' ? setCustomTransport('') : setTransport(event.target.value)}>{transportOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}<option value="Other">Other / custom vehicle</option></select></label>
        <label>Cost per day<div className="transport-money-input"><span>₹</span><input aria-label="Vehicle cost per day" type="number" min="0" value={costModel.transportDaily} onChange={(event) => setCostModel({ transportDaily: Math.max(0, Number(event.target.value) || 0) })}/></div></label>
        <div className="transport-setup-total"><span>Transport estimate</span><b>{money(chargedDays * costModel.transportDaily)}</b><small>{chargedDays} days × {money(costModel.transportDaily)}</small></div>
      </div>
      {costModel.transportIsCustom && <label className="custom-transport-name">Custom vehicle name<input aria-label="Custom vehicle name" value={input.transport} maxLength={80} onChange={(event) => setCustomTransport(event.target.value)} placeholder="e.g. Luxury minibus" required/>{customVehicleMissing && <small>Enter the vehicle name before continuing.</small>}</label>}
      <p className="transport-suggestion">{people > 6 ? 'For this group size, a Tempo Traveller may provide a more comfortable fit.' : people > 3 ? 'For this group size, Ertiga or Innova may provide a more comfortable fit.' : 'A Sedan may be sufficient for this group size; choose based on luggage and comfort.'}</p>
    </section>

    <section className="cost-card activity-cost-card"><div className="activity-cost-head"><div><span className="eyebrow">02 · DESTINATION ACTIVITIES</span><h3>Activities in this journey</h3><p>Enter the total cost for the travelling group to include an activity in the client package. Leave a cost blank to list it as an exclusion. Library switches control automatic day descriptions.</p></div><div className="activity-cost-total"><span>{includedCount} included</span><strong>{money(activityTotal)}</strong><small>before markup and GST</small></div></div>
      {activities.length ? <div className="activity-cost-groups">{[...new Set(activities.map((activity) => activity.destination))].map((destination) => { const rows = activities.filter((activity) => activity.destination === destination); return <div className="activity-cost-group" key={destination}><div className="activity-group-head"><b>{destination}</b><span>{rows.length} activities</span></div><div className="activity-cost-rows">{rows.map((activity) => { const cost = quotedActivityCost(costModel.activityCosts, activity); return <div className="activity-cost-row" key={activity.key}><div><b>{activity.name}</b><span>{cost !== null ? 'Included in the package' : activity.available ? 'Excluded until a cost is entered' : 'Not in the day description · unquoted'}</span></div><label><span>Group cost</span><div><span>₹</span><input aria-label={`${activity.name} group cost`} type="number" min="0" value={cost === null ? '' : cost} placeholder="Not included" onChange={(event) => setActivityCost(activity.key, event.target.value)}/></div></label></div>; })}</div></div>; })}</div> : <div className="activity-empty">The selected destinations have no activities in the library yet. Add activities in the destination guide.</div>}
    </section>

    <div className="next-row"><Link className="secondary-link" href="/planner/hotels"><ChevronLeft size={16}/> Back to hotels</Link><div><b>Services ready?</b><span>Review the full customer quote in Costing.</span></div>{customVehicleMissing ? <span className="primary-cta inline step-next-disabled" aria-disabled="true">Next: Costing <ChevronRight size={16}/></span> : <Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link>}</div>
  </PlannerChrome></AppShell>;
}
