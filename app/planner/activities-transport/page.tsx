'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight, Plus, Route, Search, Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { transportOptions } from '@/lib/data';
import { activitySelected, quotedActivityCost, tripActivities } from '@/lib/activities';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }

export default function ActivitiesTransportPage() {
  const { plan, input, costModel, setCostModel, setTransport, setCustomTransport, destinationCatalog, destinationConnection, destinationConnectionError, refreshDestinations, hydrated } = usePlanner();
  const [activityFilter, setActivityFilter] = useState<'all' | 'included' | 'excluded'>('all');
  const [activitySearch, setActivitySearch] = useState('');

  if (!hydrated) return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel"><Route size={28}/><h2>Loading your journey…</h2></div></PlannerChrome></AppShell>;
  if (!plan) return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel"><Route size={28}/><h2>Create the itinerary first.</h2><Link className="primary-cta inline" href="/">Build Your Trip <ChevronRight size={16}/></Link></div></PlannerChrome></AppShell>;
  if (destinationConnection !== 'ready') return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="empty-panel" role="status"><Route size={28}/><h2>{destinationConnection === 'loading' ? 'Loading destination activities…' : 'Destination activities could not load'}</h2><p>{destinationConnection === 'error' ? destinationConnectionError : 'Your activity list will appear after the destination library is ready.'}</p>{destinationConnection === 'error' && <button type="button" className="secondary-link" onClick={()=>void refreshDestinations()}>Retry destination library</button>}</div></PlannerChrome></AppShell>;

  const activities = tripActivities(plan, destinationCatalog, costModel.activitySelections);
  const includedCount = activities.filter((activity) => quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) !== null).length;
  const excludedCount = activities.filter((activity) => costModel.activitySelections[activity.key] === false).length;
  const activityTotal = activities.reduce((sum, activity) => sum + (quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) ?? 0), 0);
  const visibleActivities = activities.filter((activity) => {
    const included = quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) !== null;
    return (activityFilter === 'all' || (activityFilter === 'included' ? included : costModel.activitySelections[activity.key] === false))
      && `${activity.destination} ${activity.name}`.toLowerCase().includes(activitySearch.trim().toLowerCase());
  });
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
  function setActivityExcluded(key: string, excluded: boolean) {
    const activitySelections = { ...(costModel.activitySelections || {}) };
    const activityCosts = { ...(costModel.activityCosts || {}) };
    if (excluded) { activitySelections[key] = false; delete activityCosts[key]; }
    else delete activitySelections[key];
    setCostModel({ activitySelections, activityCosts });
  }
  function setExclusion(index: number, value: string) {
    setCostModel({ manualExclusions: (costModel.manualExclusions || []).map((item, position) => position === index ? value : item) });
  }
  function setInclusion(index: number, value: string) {
    setCostModel({ manualInclusions: (costModel.manualInclusions || []).map((item, position) => position === index ? value : item) });
  }

  return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT">
    <div className="services-intro"><div><span className="eyebrow">PACKAGE SERVICES</span><h2>Shape what the client receives.</h2><p>Set the vehicle, choose the activities you are quoting, then tailor the exact inclusion and exclusion lists shown in the client PDF.</p></div><div className="services-progress"><span><CheckCircle2 size={15}/> Vehicle and group rate</span><span><CheckCircle2 size={15}/> Destination activities</span><span><CheckCircle2 size={15}/> Client package lists</span></div></div>
    <div className="services-overview"><div><small>Transport</small><b>{money(chargedDays * costModel.transportDaily)}</b><span>{chargedDays} service days</span></div><div><small>Included activities</small><b>{includedCount} of {activities.length}</b><span>{money(activityTotal)} group total</span></div><div><small>Additional list items</small><b>{(costModel.manualInclusions || []).filter((item) => item.trim()).length + (costModel.manualExclusions || []).filter((item) => item.trim()).length}</b><span>Client-facing additions</span></div></div>

    <section className="transport-setup-card"><div><span className="overline">01 · TRANSPORT</span><h2>Choose your vehicle</h2><p>The daily rate covers {chargedDays} service days in this itinerary. Enter a custom vehicle if the listed options do not fit this group.</p></div>
      <div className="transport-setup-fields"><label>Vehicle<select aria-label="Choose your vehicle" value={costModel.transportIsCustom ? 'Other' : input.transport} onChange={(event) => event.target.value === 'Other' ? setCustomTransport('') : setTransport(event.target.value)}>{transportOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}<option value="Other">Other / custom vehicle</option></select></label>
        <label>Cost per day<div className="transport-money-input"><span>₹</span><input aria-label="Vehicle cost per day" type="number" min="0" value={costModel.transportDaily} onChange={(event) => setCostModel({ transportDaily: Math.max(0, Number(event.target.value) || 0) })}/></div></label>
        <div className="transport-setup-total"><span>Transport estimate</span><b>{money(chargedDays * costModel.transportDaily)}</b><small>{chargedDays} days × {money(costModel.transportDaily)}</small></div>
      </div>
      {costModel.transportIsCustom && <label className="custom-transport-name">Custom vehicle name<input aria-label="Custom vehicle name" value={input.transport} maxLength={80} onChange={(event) => setCustomTransport(event.target.value)} placeholder="e.g. Luxury minibus" required/>{customVehicleMissing && <small>Enter the vehicle name before continuing.</small>}</label>}
      <p className="transport-suggestion">{people > 6 ? 'For this group size, a Tempo Traveller may provide a more comfortable fit.' : people > 3 ? 'For this group size, Ertiga or Innova may provide a more comfortable fit.' : 'A Sedan may be sufficient for this group size; choose based on luggage and comfort.'}</p>
    </section>

    <section className="cost-card activity-cost-card"><div className="activity-cost-head"><div><span className="eyebrow">02 · DESTINATION ACTIVITIES</span><h3>Activities in this journey</h3><p>Include an activity with a group price, or explicitly add it to exclusions. Untouched options stay off the client PDF.</p></div><div className="activity-cost-total"><span>{includedCount} included</span><strong>{money(activityTotal)}</strong><small>before markup and GST</small></div></div>
      <div className="activity-toolbar"><div className="activity-view-tabs" role="group" aria-label="Filter activities">{([['all',`All ${activities.length}`],['included',`Included ${includedCount}`],['excluded',`Excluded ${excludedCount}`]] as const).map(([key,label])=><button type="button" key={key} aria-pressed={activityFilter===key} onClick={()=>setActivityFilter(key)}>{label}</button>)}</div><label className="activity-search"><Search size={15}/><input aria-label="Search trip activities" value={activitySearch} onChange={(event)=>setActivitySearch(event.target.value)} placeholder="Find activity or destination"/></label></div>
      {visibleActivities.length ? <div className="activity-cost-groups">{[...new Set(visibleActivities.map((activity) => activity.destination))].map((destination) => { const rows = visibleActivities.filter((activity) => activity.destination === destination); return <div className="activity-cost-group" key={destination}><div className="activity-group-head"><b>{destination}</b><span>{rows.length} activities</span></div><div className="activity-cost-rows">{rows.map((activity) => { const selected = activitySelected(activity, costModel.activitySelections, costModel.activityCosts); const excluded = costModel.activitySelections[activity.key] === false; const cost = quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections); return <div className={selected ? 'activity-cost-row selected' : 'activity-cost-row'} key={activity.key}><div className="activity-quote-info"><label className="activity-quote-choice"><input type="checkbox" aria-label={`Include ${activity.name}`} checked={selected} onChange={(event) => setActivityChecked(activity.key, event.target.checked)}/><b>{activity.name}</b></label><span>{cost !== null ? 'Included in the package' : selected ? 'Add a group price to include this activity' : excluded ? 'Shown in client exclusions' : activity.available ? 'Not offered to this client' : 'Currently disabled in the destination library'}</span><button type="button" className="activity-exclude-toggle" aria-pressed={excluded} onClick={()=>setActivityExcluded(activity.key,!excluded)}>{excluded?'Remove exclusion':'Add to exclusions'}</button></div><label><span>Group cost</span><div><span>₹</span><input aria-label={`${activity.name} group cost`} type="number" min="0" disabled={!selected} value={costModel.activityCosts?.[activity.key] ?? ''} placeholder={selected ? 'Enter amount' : 'Not selected'} onChange={(event) => setActivityCost(activity.key, event.target.value)}/></div></label></div>; })}</div></div>; })}</div> : <div className="activity-empty">{activities.length?'No activities match this view. Try another filter or search.':'The visited destinations have no popular activities in the library yet. Add activities on their destination pages.'}</div>}
    </section>

    <div className="client-package-lists"><section className="cost-card activity-cost-card manual-exclusion-card client-list-card include"><div className="activity-cost-head"><div><span className="eyebrow">03 · CLIENT INCLUSIONS</span><h3>Additional inclusions</h3><p>Add services or experiences promised to this client beyond the standard package and priced activities.</p></div></div><button type="button" className="secondary-link" onClick={() => setCostModel({ manualInclusions: [...(costModel.manualInclusions || []), ''] })}><Plus size={16}/> Add inclusion</button>
      {(costModel.manualInclusions || []).length > 0 && <div className="manual-exclusion-list">{costModel.manualInclusions.map((item, index) => <div className="manual-exclusion-row" key={index}><input aria-label={`Additional inclusion ${index + 1}`} value={item} onChange={(event) => setInclusion(index, event.target.value)} placeholder="e.g. Welcome dinner"/><button type="button" aria-label={`Remove inclusion ${index + 1}`} onClick={() => setCostModel({ manualInclusions: costModel.manualInclusions.filter((_, position) => position !== index) })}><Trash2 size={16}/></button></div>)}</div>}<small>These lines appear in the PDF. Add any supplier cost separately in Costing.</small></section>
    <section className="cost-card activity-cost-card manual-exclusion-card client-list-card exclude"><div className="activity-cost-head"><div><span className="eyebrow">04 · CLIENT EXCLUSIONS</span><h3>Additional exclusions</h3><p>Add only extra items you want the client to see as excluded. Activities appear here only when you explicitly mark them as excluded above.</p></div></div><button type="button" className="secondary-link" onClick={() => setCostModel({ manualExclusions: [...(costModel.manualExclusions || []), ''] })}><Plus size={16}/> Add exclusion</button>
      {(costModel.manualExclusions || []).length > 0 && <div className="manual-exclusion-list">{costModel.manualExclusions.map((item, index) => <div className="manual-exclusion-row" key={index}><input aria-label={`Additional exclusion ${index + 1}`} value={item} onChange={(event) => setExclusion(index, event.target.value)} placeholder="e.g. Airfare"/><button type="button" aria-label={`Remove exclusion ${index + 1}`} onClick={() => setCostModel({ manualExclusions: costModel.manualExclusions.filter((_, position) => position !== index) })}><Trash2 size={16}/></button></div>)}</div>}<small>Leave empty if there are no other exclusions.</small></section></div>

    <div className="next-row"><Link className="secondary-link" href="/planner/hotels"><ChevronLeft size={16}/> Back to hotels</Link><div><b>Services ready?</b><span>Review the full customer quote in Costing.</span></div>{customVehicleMissing ? <span className="primary-cta inline step-next-disabled" aria-disabled="true">Next: Costing <ChevronRight size={16}/></span> : <Link className="primary-cta inline" href="/planner/costing">Next: Costing <ChevronRight size={16}/></Link>}</div>
  </PlannerChrome></AppShell>;
}
