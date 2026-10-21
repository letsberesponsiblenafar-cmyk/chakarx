'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Route, Search, Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { transportOptions } from '@/lib/data';
import { activitySelected, quotedActivityCost, tripActivities } from '@/lib/activities';
import { packageCategories, packageView } from '@/lib/package-quotes';
import './package-transport.css';
import './services-compact.css';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }

export default function ActivitiesTransportPage() {
  const planner = usePlanner();
  const { plan, input, costModel, setCostModel, setTransport, setCustomTransport, setPackageTransport, setPackageTransportRate, destinationCatalog, destinationConnection, destinationConnectionError, refreshDestinations, hydrated, packageQuotes } = planner;
  const [activityFilter, setActivityFilter] = useState<'all' | 'included' | 'excluded'>('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [nextVehicleCategory, setNextVehicleCategory] = useState('');
  const categories = packageCategories(input);
  const optionalVehicleCategories = categories.slice(1);
  const addedVehicleCategories = optionalVehicleCategories.filter((category) => typeof packageQuotes?.[category]?.transport === 'string');
  const availableVehicleCategories = optionalVehicleCategories.filter((category) => !addedVehicleCategories.includes(category));
  const categoryToAdd = availableVehicleCategories.includes(nextVehicleCategory) ? nextVehicleCategory : availableVehicleCategories[0] || '';

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

  return <AppShell><PlannerChrome title="Activities & Transport" eyebrow="STEP 03 · ACTIVITIES & TRANSPORT"><div className="services-workspace">
    <div className="services-overview"><div><small>Transport</small><b>{money(chargedDays * costModel.transportDaily)}</b><span>{chargedDays} service days</span></div><div><small>Included activities</small><b>{includedCount} of {activities.length}</b><span>{money(activityTotal)} group total</span></div><div><small>Additional list items</small><b>{(costModel.manualInclusions || []).filter((item) => item.trim()).length + (costModel.manualExclusions || []).filter((item) => item.trim()).length}</b><span>Client-facing additions</span></div></div>

    <section className="transport-setup-card"><div><span className="overline">01 · TRANSPORT</span><h2>Vehicle &amp; rate</h2><p>{chargedDays} service days{categories.length > 1 ? ' · Default for all packages' : ''}</p></div>
      <div className="transport-setup-fields"><label>Vehicle<select aria-label="Choose your vehicle" value={costModel.transportIsCustom ? 'Other' : input.transport} onChange={(event) => event.target.value === 'Other' ? setCustomTransport('') : setTransport(event.target.value)}>{transportOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}<option value="Other">Other / custom vehicle</option></select></label>
        <label>Cost per day<div className="transport-money-input"><span>₹</span><input aria-label="Vehicle cost per day" type="number" min="0" value={costModel.transportDaily} onChange={(event) => setCostModel({ transportDaily: Math.max(0, Number(event.target.value) || 0) })}/></div></label>
        <div className="transport-setup-total"><span>Transport estimate</span><b>{money(chargedDays * costModel.transportDaily)}</b><small>{chargedDays} days × {money(costModel.transportDaily)}</small></div>
      </div>
      {costModel.transportIsCustom && <label className="custom-transport-name">Custom vehicle name<input aria-label="Custom vehicle name" value={input.transport} maxLength={80} onChange={(event) => setCustomTransport(event.target.value)} placeholder="e.g. Luxury minibus" required/>{customVehicleMissing && <small>Enter the vehicle name before continuing.</small>}</label>}
      <p className="transport-suggestion">{people > 6 ? 'For this group size, a Tempo Traveller may provide a more comfortable fit.' : people > 3 ? 'For this group size, Ertiga or Innova may provide a more comfortable fit.' : 'A Sedan may be sufficient for this group size; choose based on luggage and comfort.'}</p>
      {categories.length > 1 && <details className="package-vehicle-options">
        <summary><div><b>Alternative vehicles</b><span>{addedVehicleCategories.length ? `${addedVehicleCategories.length} package-specific option${addedVehicleCategories.length === 1 ? '' : 's'}` : 'Optional · use the default for all packages'}</span></div><ChevronRight size={18} aria-hidden="true"/></summary>
        <div className="package-vehicle-options-body">
          {addedVehicleCategories.map((category) => {
            const quote = packageView(planner, category);
            return <section className="package-vehicle-card" key={category} aria-label={`${category} transport`}>
              <div className="package-vehicle-heading"><div><span>PACKAGE PREFERENCE</span><h3>{category}</h3></div><button type="button" aria-label={`Use default vehicle for ${category}`} onClick={() => setPackageTransport(category, null)}><Trash2 size={15}/> Use default</button></div>
              <div className="transport-setup-fields">
                <label>Vehicle<select aria-label={`${category} vehicle`} value={quote.costModel.transportIsCustom ? 'Other' : quote.input.transport} onChange={(event) => setPackageTransport(category, event.target.value === 'Other' ? '' : event.target.value, event.target.value === 'Other')}>
                  {transportOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}<option value="Other">Other / custom vehicle</option>
                </select></label>
                <label>Cost per day<div className="transport-money-input"><span>₹</span><input aria-label={`${category} vehicle cost per day`} type="number" min="0" value={quote.costModel.transportDaily} onChange={(event) => setPackageTransportRate(category, Math.max(0, Number(event.target.value) || 0))}/></div></label>
                <div className="transport-setup-total"><span>Transport estimate</span><b>{money(chargedDays * quote.costModel.transportDaily)}</b><small>{chargedDays} days × {money(quote.costModel.transportDaily)}</small></div>
              </div>
              {quote.costModel.transportIsCustom && <label className="custom-transport-name">Custom vehicle name<input aria-label={`${category} custom vehicle name`} value={quote.input.transport} maxLength={80} onChange={(event) => setPackageTransport(category, event.target.value, true)} placeholder="e.g. Luxury minibus"/></label>}
            </section>;
          })}
          {availableVehicleCategories.length > 0 && <div className="package-vehicle-add"><label>Package preference<select aria-label="Package for an additional vehicle" value={categoryToAdd} onChange={(event) => setNextVehicleCategory(event.target.value)}>{availableVehicleCategories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><button type="button" className="secondary-link" onClick={() => { setPackageTransport(categoryToAdd, input.transport, costModel.transportIsCustom); setPackageTransportRate(categoryToAdd, costModel.transportDaily); }}><Plus size={16}/> Add vehicle option</button></div>}
          <p className="package-vehicle-inheritance">{optionalVehicleCategories.filter((category) => !addedVehicleCategories.includes(category)).length ? `${optionalVehicleCategories.filter((category) => !addedVehicleCategories.includes(category)).join(' and ')} ${availableVehicleCategories.length === 1 ? 'uses' : 'use'} the default vehicle and rate.` : 'Each preference has its own vehicle option. Remove an option to use the default again.'}</p>
        </div>
      </details>}
    </section>

    <section className="cost-card activity-cost-card"><div className="activity-cost-head"><div><span className="eyebrow">02 · ACTIVITIES</span><h3>Choose experiences</h3><p>Select an activity and enter its group price.</p></div><div className="activity-cost-total"><span>{includedCount} included</span><strong>{money(activityTotal)}</strong><small>before markup and GST</small></div></div>
      <details className="services-help"><summary>How inclusions work</summary><p>Untouched activities stay off the client PDF. Mark an activity as excluded to list its charges in exclusions. Sightseeing checked in the library stays in the day programme. A zero price means the activity is complimentary.</p></details>
      <div className="activity-toolbar"><div className="activity-view-tabs" role="group" aria-label="Filter activities">{([['all',`All ${activities.length}`],['included',`Included ${includedCount}`],['excluded',`Excluded ${excludedCount}`]] as const).map(([key,label])=><button type="button" key={key} aria-pressed={activityFilter===key} onClick={()=>setActivityFilter(key)}>{label}</button>)}</div><label className="activity-search"><Search size={15}/><input aria-label="Search trip activities" value={activitySearch} onChange={(event)=>setActivitySearch(event.target.value)} placeholder="Find activity or destination"/></label></div>
      {visibleActivities.length ? <div className="activity-cost-groups">{[...new Set(visibleActivities.map((activity) => activity.destination))].map((destination, index) => { const rows = visibleActivities.filter((activity) => activity.destination === destination); return <details className="activity-cost-group" key={destination} open={index === 0 || activityFilter !== "all" || Boolean(activitySearch.trim())}><summary className="activity-group-head"><b>{destination}</b><span>{rows.length} activities<ChevronRight size={15} aria-hidden="true"/></span></summary><div className="activity-cost-rows">{rows.map((activity) => { const selected = activitySelected(activity, costModel.activitySelections, costModel.activityCosts); const excluded = costModel.activitySelections[activity.key] === false; const cost = quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections); return <div className={selected ? 'activity-cost-row selected' : 'activity-cost-row'} key={activity.key}><div className="activity-quote-info"><label className="activity-quote-choice"><input type="checkbox" aria-label={`Include ${activity.name}`} checked={selected} disabled={!activity.available && !selected} onChange={(event) => setActivityChecked(activity.key, event.target.checked)}/><b>{activity.name}</b></label><span>{!activity.available ? 'Currently disabled in the destination library' : cost !== null ? 'Included' : selected ? 'Group price needed' : excluded ? 'Excluded' : 'Not included'}</span><button type="button" className="activity-exclude-toggle" aria-pressed={excluded} aria-label={`${excluded ? "Remove" : "Add"} ${activity.name} ${excluded ? "from" : "to"} exclusions`} onClick={()=>setActivityExcluded(activity.key,!excluded)}>{excluded?'Undo exclusion':'Exclude'}</button></div><label><span>Group cost</span><div><span>₹</span><input aria-label={`${activity.name} group cost`} type="number" min="0" aria-invalid={selected && cost === null} disabled={!selected || !activity.available} value={costModel.activityCosts?.[activity.key] ?? ''} placeholder={selected ? 'Amount' : '—'} onChange={(event) => setActivityCost(activity.key, event.target.value)}/></div></label></div>; })}</div></details>; })}</div> : <div className="activity-empty">{activities.length?'No activities match this view. Try another filter or search.':'The visited destinations have no popular activities in the library yet. Add activities on their destination pages.'}</div>}
    </section>

    <div className="client-package-lists"><section className="cost-card activity-cost-card manual-exclusion-card client-list-card include"><div className="activity-cost-head"><div><span className="eyebrow">03 · INCLUSIONS</span><h3>Additional inclusions</h3><p>Extra services promised to this client.</p></div></div><button type="button" className="secondary-link" onClick={() => setCostModel({ manualInclusions: [...(costModel.manualInclusions || []), ''] })}><Plus size={16}/> Add inclusion</button>
      {(costModel.manualInclusions || []).length > 0 && <div className="manual-exclusion-list">{costModel.manualInclusions.map((item, index) => <div className="manual-exclusion-row" key={index}><input aria-label={`Additional inclusion ${index + 1}`} value={item} onChange={(event) => setInclusion(index, event.target.value)} placeholder="e.g. Welcome dinner"/><button type="button" aria-label={`Remove inclusion ${index + 1}`} onClick={() => setCostModel({ manualInclusions: costModel.manualInclusions.filter((_, position) => position !== index) })}><Trash2 size={16}/></button></div>)}</div>}<small>These lines appear in the PDF. Add any supplier cost separately in Costing.</small></section>
    <section className="cost-card activity-cost-card manual-exclusion-card client-list-card exclude"><div className="activity-cost-head"><div><span className="eyebrow">04 · EXCLUSIONS</span><h3>Additional exclusions</h3><p>Extra items not covered by the package.</p></div></div><button type="button" className="secondary-link" onClick={() => setCostModel({ manualExclusions: [...(costModel.manualExclusions || []), ''] })}><Plus size={16}/> Add exclusion</button>
      {(costModel.manualExclusions || []).length > 0 && <div className="manual-exclusion-list">{costModel.manualExclusions.map((item, index) => <div className="manual-exclusion-row" key={index}><input aria-label={`Additional exclusion ${index + 1}`} value={item} onChange={(event) => setExclusion(index, event.target.value)} placeholder="e.g. Airfare"/><button type="button" aria-label={`Remove exclusion ${index + 1}`} onClick={() => setCostModel({ manualExclusions: costModel.manualExclusions.filter((_, position) => position !== index) })}><Trash2 size={16}/></button></div>)}</div>}<small>Leave empty if there are no other exclusions.</small></section></div>

    <div className="next-row"><Link className="secondary-link" href="/planner/hotels"><ChevronLeft size={16}/> Back to hotels</Link><div><b>Services ready?</b><span>Review the day descriptions next.</span></div>{customVehicleMissing ? <span className="primary-cta inline step-next-disabled" aria-disabled="true">Next: Itinerary <ChevronRight size={16}/></span> : <Link className="primary-cta inline" href="/planner/itinerary">Next: Itinerary <ChevronRight size={16}/></Link>}</div>
  </div></PlannerChrome></AppShell>;
}
