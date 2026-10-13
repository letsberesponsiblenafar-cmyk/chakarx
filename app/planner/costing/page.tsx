'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BedDouble, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, LockKeyhole, Route, Sparkles, WalletCards } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';
import { quotedActivityCost, tripActivities } from '@/lib/activities';
import { quoteReadiness } from '@/lib/quote-readiness';
import { activeHotelSelections, hotelNightNumbers, hotelSelectionKey, hotelStayLabel } from '@/lib/accommodation';
import { effectiveHotelSelection } from '@/lib/hotel-options';
import './costing.css';

function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }
const PROFIT_PRESETS = [5, 8, 10, 12, 15, 20, 25];

// Keep a temporary empty value while typing, without storing invalid quote amounts.
function QuoteNumberInput({ id, label, value, onChange, max, percent = false }: {
  id: string; label: string; value: number; onChange: (value: number) => void;
  max?: number; percent?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  return <div className="cq-field">
    <label htmlFor={id}>{label}</label>
    <div className="cq-number-input">
      {!percent && <span aria-hidden="true">₹</span>}
      <input id={id} type="number" min="0" max={max} step={percent ? '0.5' : '1'} value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const amount = Number(raw);
          onChange(Number.isFinite(amount) ? Math.max(0, Math.min(max ?? Infinity, amount)) : 0);
        }}
        onBlur={() => { setEditing(false); setDraft(String(value)); }}/>
      {percent && <span aria-hidden="true">%</span>}
    </div>
  </div>;
}

export default function CostingPage() {
  const { plan, hotelSelections, costModel, setCostModel, input, hydrated, destinationCatalog, destinationConnection, hotelDatabase, hotelConnection } = usePlanner();
  const costs = useMemo(() => plan ? calculateCosts(plan, hotelSelections, costModel) : null, [plan, hotelSelections, costModel, destinationCatalog]);

  if (!hydrated) return <AppShell><PlannerChrome title="Costing" eyebrow="STEP 05 · COSTING"><div className="empty-panel"><WalletCards size={28}/><h2>Loading your current quote…</h2></div></PlannerChrome></AppShell>;
  if (!plan || !costs) return <AppShell><PlannerChrome title="Costing" eyebrow="STEP 05 · COSTING"><div className="empty-panel"><WalletCards size={28}/><h2>Complete the itinerary and hotels first.</h2><Link className="primary-cta inline" href="/"><ChevronRight size={16}/> Build Your Trip</Link></div></PlannerChrome></AppShell>;
  if (hotelConnection !== 'ready' || destinationConnection !== 'ready') return <AppShell><PlannerChrome title="Costing" eyebrow="STEP 05 · COSTING"><div className="empty-panel" role="status"><WalletCards size={28}/><h2>{hotelConnection === 'loading' || destinationConnection === 'loading' ? 'Loading quote data…' : 'Quote data needs attention'}</h2><p>Hotel database: {hotelConnection}. Destination library: {destinationConnection}. The final amount will appear when both are ready.</p><Link className="secondary-link" href="/planner/hotels">Review hotels</Link></div></PlannerChrome></AppShell>;

  const groupBudget = (input.budget || 0) * costs.people;
  const withinBudget = groupBudget === 0 || costs.sellingTotal <= groupBudget;
  const perPerson = costs.people > 0 ? costs.sellingTotal / costs.people : 0;
  const includedCount = tripActivities(plan, destinationCatalog, costModel.activitySelections).filter((activity) => quotedActivityCost(costModel.activityCosts, activity, costModel.activitySelections) !== null).length;
  const stays = activeHotelSelections(plan, hotelSelections).map((hotel) => ({ ...effectiveHotelSelection(hotel, plan.input.hotelOptionMode), nights: hotelNightNumbers(plan, hotel).length }));
  const quoteIssues = quoteReadiness(plan, input, hotelSelections, costModel, hotelDatabase, hotelConnection, destinationConnection);

  return <AppShell><PlannerChrome title="Trip costing" eyebrow="STEP 05 · COSTING">
    <div className="costing-workspace">
      <section className="cq-investment" aria-labelledby="cq-investment-heading">
        <div className="cq-investment-main">
          <span className="cq-overline">CUSTOMER INVESTMENT</span>
          <h2 id="cq-investment-heading">{money(costs.sellingTotal)}</h2>
          <p>Total for the travelling group, including markup and 5% GST.</p>
        </div>
        <div className="cq-investment-facts">
          <div><span>Per person</span><strong>{money(perPerson)}</strong><small>{costs.people} traveller{costs.people === 1 ? '' : 's'} · group average</small></div>
          <div><span>Budget per person</span><strong>{input.budget ? money(input.budget) : 'No cap'}</strong><small className={groupBudget ? withinBudget ? 'cq-budget-within' : 'cq-budget-over' : ''}>{groupBudget ? <>{withinBudget ? <CheckCircle2 size={13}/> : <CircleAlert size={13}/>} {withinBudget ? 'Within budget' : 'Above budget'}</> : 'No budget reference set'}</small></div>
        </div>
      </section>

      <div className="cq-layout">
        <div className="cq-breakdown">
          <section className="cq-panel" aria-labelledby="cq-accommodation-heading">
            <div className="cq-panel-heading"><div className="cq-heading-copy"><span className="cq-icon"><BedDouble size={19}/></span><div><h2 id="cq-accommodation-heading">Accommodation</h2><p>Your selected hotels and houseboats.</p></div></div><strong>{money(costs.accommodation)}</strong></div>
            <div className="cq-stay-list">{stays.map((hotel) => {
              const roomCost = hotel.nights * hotel.rooms * hotel.nightlyRate;
              const extraBedCost = hotel.nights * hotel.extraBeds * hotel.extraBedRate;
              const childCost = hotel.nights * hotel.cnb * hotel.cnbRate;
              return <article className="cq-stay" key={hotelSelectionKey(hotel)}>
                <div className="cq-stay-heading"><span>{hotelStayLabel(hotel)}</span><b>{money(roomCost + extraBedCost + childCost)}</b></div>
                <h3>{hotel.hotelName}</h3>
                <div className="cq-stay-calculation"><span>{hotel.nights} night{hotel.nights === 1 ? '' : 's'} × {hotel.rooms} room{hotel.rooms === 1 ? '' : 's'} × {money(hotel.nightlyRate)}</span>{hotel.extraBeds > 0 && <span>{hotel.extraBeds} extra bed{hotel.extraBeds === 1 ? '' : 's'} × {money(hotel.extraBedRate)} × {hotel.nights} nights</span>}{hotel.cnb > 0 && <span>{hotel.cnb} child{hotel.cnb === 1 ? '' : 'ren'} without bed × {money(hotel.cnbRate)} × {hotel.nights} nights</span>}</div>
              </article>;
            })}</div>
            <Link className="cq-edit-link" href="/planner/hotels">Review accommodation <ArrowUpRight size={15}/></Link>
          </section>

          <section className="cq-panel" aria-labelledby="cq-services-heading">
            <div className="cq-panel-heading"><div className="cq-heading-copy"><span className="cq-icon"><Route size={19}/></span><div><h2 id="cq-services-heading">Journey services</h2><p>Selected in Activities &amp; Transport.</p></div></div></div>
            <div className="cq-service-row"><div><span className="cq-service-label">Transport</span><h3>{input.transport || 'Vehicle to be selected'}</h3><p>{costs.vehicleDays} service day{costs.vehicleDays === 1 ? '' : 's'} × {money(costModel.transportDaily)} per day</p></div><strong>{money(costs.transport)}</strong></div>
            <div className="cq-service-row"><div><span className="cq-service-label"><Sparkles size={13}/> Activities</span><h3>{includedCount} priced activit{includedCount === 1 ? 'y' : 'ies'}</h3><p>Combined cost for the whole travelling group.</p></div><strong>{money(costs.activities)}</strong></div>
            <Link className="cq-edit-link" href="/planner/activities-transport">Review vehicle and activities <ArrowUpRight size={15}/></Link>
          </section>

          <section className="cq-panel cq-additional" aria-labelledby="cq-additional-heading">
            <div><h2 id="cq-additional-heading">Other package costs</h2><p>Add any further internal supplier costs for this group.</p></div>
            <QuoteNumberInput id="cq-other-amount" label="Additional amount" value={costModel.otherAmount} onChange={(otherAmount) => setCostModel({ otherAmount })}/>
          </section>

          <section className="cq-panel cq-markup" aria-labelledby="cq-markup-heading">
            <div className="cq-panel-heading"><div><span className="cq-private-label"><LockKeyhole size={13}/> INTERNAL ONLY</span><h2 id="cq-markup-heading">Set your markup</h2><p>Applied to the total package cost before GST.</p></div><strong>{money(costs.profit)}</strong></div>
            <div className="cq-markup-controls"><div className="cq-presets" role="group" aria-label="Markup percentage">{PROFIT_PRESETS.map((percentage) => <button type="button" key={percentage} aria-pressed={costModel.profitPct === percentage} onClick={() => setCostModel({ profitPct: percentage })}>{percentage}%</button>)}</div><QuoteNumberInput id="cq-custom-markup" label="Custom markup" value={costModel.profitPct} max={100} percent onChange={(profitPct) => setCostModel({ profitPct })}/></div>
            <p className="cq-privacy-note">Supplier rates and markup stay private. The client PDF shows the final package price.</p>
          </section>
        </div>

        <aside className="cq-quote-summary" aria-labelledby="cq-summary-heading">
          <div className="cq-summary-heading"><span className="cq-overline">YOUR QUOTE</span><h2 id="cq-summary-heading">Price breakdown</h2></div>
          <dl className="cq-summary-lines">
            <div><dt>Accommodation</dt><dd>{money(costs.accommodation)}</dd></div>
            <div><dt>Transport</dt><dd>{money(costs.transport)}</dd></div>
            <div><dt>Activities</dt><dd>{money(costs.activities)}</dd></div>
            <div><dt>Other costs</dt><dd>{money(costModel.otherAmount)}</dd></div>
            <div className="cq-summary-subtotal"><dt>Cost before markup</dt><dd>{money(costs.preGst)}</dd></div>
            <div><dt>Markup <span>{costModel.profitPct}%</span></dt><dd>{money(costs.profit)}</dd></div>
            <div><dt>Subtotal</dt><dd>{money(costs.subtotalAfterMarkup)}</dd></div>
            <div><dt>GST <span>5%</span></dt><dd>{money(costs.gst)}</dd></div>
          </dl>
          <div className="cq-summary-total"><span>Final customer total</span><strong>{money(costs.sellingTotal)}</strong><small>{money(perPerson)} per person · {costs.people} traveller{costs.people === 1 ? '' : 's'}</small></div>
          {groupBudget > 0 && <p className="cq-budget-reference">Group budget reference <b>{money(groupBudget)}</b></p>}
          <details className="cq-range"><summary>View planning range <ChevronRight size={14}/></summary><div><b>{money(costs.low)} – {money(costs.high)}</b><p>Reference range around this quote, including markup and GST. The final price above is used in the PDF.</p></div></details>
        </aside>
      </div>

      {quoteIssues.length > 0 && <section className="cq-attention" role="alert" aria-labelledby="cq-attention-heading"><CircleAlert size={19}/><div><h2 id="cq-attention-heading">A few details need attention</h2><p>Resolve these before downloading the client itinerary.</p><ul>{quoteIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></section>}
      <div className="cq-footer"><Link className="cq-back-link" href="/planner/itinerary"><ChevronLeft size={16}/> Back to itinerary</Link><div className="cq-next-step"><span>{quoteIssues.length ? 'Review the quote details above.' : <><CheckCircle2 size={15}/> Ready for the client preview</>}</span><Link className="cq-next-button" href="/planner/pdf">Next: Client PDF <ChevronRight size={17}/></Link></div></div>
    </div>
  </PlannerChrome></AppShell>;
}
