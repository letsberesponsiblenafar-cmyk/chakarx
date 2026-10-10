'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Route, Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { transportOptions } from '@/lib/data';
import { activitySelected, quotedActivityCost, tripActivities } from '@/lib/activities';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }

export default function ActivitiesTransportPage() {
  const { plan, input, costModel, setCostModel, setTransport, setCustomTransport, destinationCatalog, hydrated } = usePlanner();

  if (!hydrated) return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel"><Route size={28}/><h2>Loading your journey…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel"><Route size={28}/><h2>Create the itinerary first.</h2><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;

  const activities = tripActivities(plan, destinationCatalog);
  const includedCount = activities.filter((activity) => quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) !== null).length;
  const activityTotal = activities.reduce((sum, activity) => sum + (quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) ?? 0), 0);
  const chargedDays = plan.dayPlans.length;
  const customVehicleMissing = costModel.transportIsCustom && !input.transport.trim();
  const people = input.adults + input.youngAges.length;

  function setActivityCost(key: string, raw: string) {
    const activityCosts = { ...(costModel.activityCosts || {}) };
    if (raw.trim() === '') delete activityCosts[key];
    else if (Number.isFinite(Number(raw)) && Number(raw) >= 0) activityCosts[key] = Number(raw);
    setCostModel({ activityCosts });
  }
  function setActivityChecked(key: string, checked: boolean) {
    const activitySelections = { ...(costModel.activitySelections || {}), [key]: checked };
    const activityCosts = { ...(costModel.activityCosts || {}) };
    if (!checked) delete activityCosts[key];
    setCostModel({ activitySelections, activityCosts });
  }
  function setExclusion(index: number, value: string) {
    setCostModel({ manualExclusions: (costModel.manualExclusions || []).map((item, position) => position === index ? value : item) });
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

    <section className="cost-card activity-cost-card"><div className="activity-cost-head"><div><span className="eyebrow">02 · DESTINATION ACTIVITIES</span><h3>Activities in this journey</h3><p>Every popular activity from the visited destinations is listed here. Tick an activity and enter its group price to include it. Unticked or unpriced activities appear in the client exclusions.</p></div><div className="activity-cost-total"><span>{includedCount} included</span><strong>{money(activityTotal)}</strong><small>before markup and GST</small></div></div>
      {activities.length ? <div className="activity-cost-groups">{[...new Set(activities.map((activity) => activity.destination))].map((destination) => { const rows = activities.filter((activity) => activity.destination === destination); return <div className="activity-cost-group" key={destination}><div className="activity-group-head"><b>{destination}</b><span>{rows.length} activities</span></div><div className="activity-cost-rows">{rows.map((activity) => { const selected = activitySelected(activity, costModel.activitySelections, costModel.activityCosts); const cost = quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections); return <div className={selected ? 'activity-cost-row selected' : 'activity-cost-row'} key={activity.key}><div className="activity-quote-info"><label className="activity-quote-choice"><input type="checkbox" aria-label={`Include ${activity.name}`} checked={selected} onChange={(event) => setActivityChecked(activity.key, event.target.checked)}/><b>{activity.name}</b></label><span>{cost !== null ? 'Included in the package' : selected ? 'Add a group price to include this activity' : 'Excluded from this package'}</span></div><label><span>Group cost</span><div><span>₹</span><input aria-label={`${activity.name} group cost`} type="number" min="0" disabled={!selected} value={costModel.activityCosts?.[activity.key] ?? ''} placeholder={selected ? 'Enter amount' : 'Not selected'} onChange={(event) => setActivityCost(activity.key, event.target.value)}/></div></label></div>; })}</div></div>; })}</div> : <div className="activity-empty">The visited destinations have no popular activities in the library yet. Add activities on their destination pages.</div>}
    </section>

    <section className="cost-card activity-cost-card manual-exclusion-card"><div className="activity-cost-head"><div><span className="eyebrow">03 · CLIENT EXCLUSIONS</span><h3>Additional exclusions</h3><p>Add only the extra items you explicitly want the client to see as excluded. Leave this section empty to use only the unticked or unpriced activities above.</p></div><button type="button" className="secondary-link" onClick={() => setCostModel({ manualExclusions: [...(costModel.manualExclusions || []), ''] })}><Plus size={16}/> Add exclusion</button></div>
      {(costModel.manualExclusions || []).length > 0 && <div className="manual-exclusion-list">{costModel.manualExclusions.map((item, index) => <div className="manual-exclusion-row" key={index}><input aria-label={`Additional exclusion ${index + 1}`} value={item} onChange={(event) => setExclusion(index, event.target.value)} placeholder="e.g. Airfare"/><button type="button" aria-label={`Remove exclusion ${index + 1}`} onClick={() => setCostModel({ manualExclusions: costModel.manualExclusions.filter((_, position) => position !== index) })}><Trash2 size={16}/></button></div>)}</div>}
    </section>

    <div className="next-row"><Link className="secondary-link" href="/planner/hotels"><ChevronLeft size={16}/> Back to hotels</Link><div><b>Services ready?</b><span>Review the full customer quote in Costing.</span></div>{customVehicleMissing ? <span className="primary-cta inline step-next-disabled" aria-disabled="true">Next: Costing <ChevronRight size={16}/></span> : <Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link>}</div>
  </PlannerChrome></AppShell>;
}
