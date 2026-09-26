'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, LockKeyhole, WalletCards } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';
function money(v:number){return `₹${Math.round(v).toLocaleString('en-IN')}`}
const PROFIT_PRESETS=[5,8,10,12,15,20,25];
export default function CostingPage(){
 const {plan,hotelSelections,costModel,setCostModel,input,hydrated}=usePlanner();
 const costs=useMemo(()=>plan?calculateCosts(plan,hotelSelections,costModel):null,[plan,hotelSelections,costModel]);
 if(!hydrated)return <AppShell><PlannerChrome title="Costing" eyebrow="STEP 03 · COSTING"><div className="empty-panel"><WalletCards size={28}/><h2>Loading your current quote…</h2></div></PlannerChrome></AppShell>;
 if(!plan||!costs)return <AppShell><PlannerChrome title="Costing" eyebrow="STEP 03 · COSTING"><div className="empty-panel"><WalletCards size={28}/><h2>Complete the itinerary and hotels first.</h2><Link className="primary-cta inline" href="/"><ChevronRight size={16}/> Build Your Trip</Link></div></PlannerChrome></AppShell>;
 const groupBudget=(input.budget||0)*costs.people; const within=groupBudget===0||costs.sellingTotal<=groupBudget;
 return <AppShell><PlannerChrome title="Trip costing" eyebrow="STEP 03 · COSTING">
  <section className="cost-summary"><div><span className="eyebrow">CUSTOMER SELLING TOTAL</span><h2>{money(costs.sellingTotal)}</h2><p>Accommodation + transport + other costs, then your custom markup, 5% GST and the final customer total. Internal rates are omitted from the client PDF.</p></div><div className={within?'budget-status ok':'budget-status warn'}><span>Budget / person</span><b>{input.budget?money(input.budget):'No cap'}</b><small>{groupBudget?`${within?'Within':'Above'} group reference · ${money(groupBudget)}`:'No budget cap'}</small></div></section>
  <div className="cost-grid four-columns">
   <article className="cost-card"><div className="cost-card-title"><h3>Accommodation</h3><span>From Hotels</span></div>{hotelSelections.map(h=><div className="cost-line" key={h.location}><span>{h.location} · {h.hotelName}<small>{h.nights}N × {h.rooms} room · {h.extraBeds} extra bed · {h.cnb} CNB</small></span><b>{money(h.nights*h.rooms*h.nightlyRate+h.nights*h.extraBeds*h.extraBedRate+h.nights*h.cnb*h.cnbRate)}</b></div>)}<div className="cost-total-line"><span>Accommodation</span><b>{money(costs.accommodation)}</b></div></article>
   <article className="cost-card"><div className="cost-card-title"><h3>Transport</h3><span>Selected in Hotels</span></div><div className="cost-line"><span>{input.transport}<small>{costs.vehicleDays} charged day(s) × {money(costModel.transportDaily)} / day</small></span><b>{money(costs.transport)}</b></div><Link className="secondary-link" href="/planner/hotels">Edit vehicle and rate</Link></article>
   <article className="cost-card"><div className="cost-card-title"><h3>Others</h3><span>Additional package costs</span></div><div className="edit-cost"><label>Other amount</label><div><span>₹</span><input type="number" min="0" value={Math.round(costModel.otherAmount)} onChange={e=>setCostModel({otherAmount:Math.max(0,+e.target.value||0)})}/></div><small>Use for any additional internal package item.</small></div><div className="cost-line"><span>Others subtotal<small>Only additional internal package costs</small></span><b>{money(costs.other)}</b></div></article>
  </div>
  <section className="selling-range-box"><div><span>Customer selling range</span><b>{money(costs.low)} – {money(costs.high)}</b><small>Planning reference around the selected quote, including markup and GST.</small></div><div><span>Cost before markup</span><b>{money(costs.preGst)}</b><small>Accommodation + transport + others.</small></div></section>
  <section className="profit-strip"><div><div className="profit-lock"><LockKeyhole size={14}/><span>INTERNAL PROFIT / MARKUP</span></div><h3>Profit and markup</h3><p>Private operator control. This value is not printed in the client PDF.</p></div><div className="profit-controls"><div className="profit-presets">{PROFIT_PRESETS.map(v=><button key={v} className={costModel.profitPct===v?'profit-preset active':'profit-preset'} onClick={()=>setCostModel({profitPct:v})}>{v}%</button>)}<label className="custom-profit"><span>Custom</span><input type="number" min="0" max="100" step="0.5" value={costModel.profitPct} onChange={e=>setCostModel({profitPct:Math.max(0,Math.min(100,+e.target.value||0))})}/><b>%</b></label></div><div className="profit-readout"><span>Cost before markup</span><b>{money(costs.preGst)}</b><span>Profit at {costModel.profitPct}%</span><strong>{money(costs.profit)}</strong><span>Subtotal after markup</span><b>{money(costs.subtotalAfterMarkup)}</b></div></div></section>
  <section className="cost-card gst-final-card"><div className="cost-card-title"><h3>GST</h3><span>Applied after profit / markup</span></div><div className="gst-final-row"><div><span>Subtotal after markup</span><b>{money(costs.subtotalAfterMarkup)}</b></div><div><span>GST @ 5%</span><b>{money(costs.gst)}</b></div><div className="final-total"><span>Final customer total</span><strong>{money(costs.sellingTotal)}</strong></div></div></section>
  {costs.missingHotelRates.length>0&&<div className="cost-warning"><LockKeyhole size={14}/><span><b>Hotel costing incomplete.</b> Missing/zero room rate: {costs.missingHotelRates.join(', ')}. You can type a custom hotel and its internal rate in Hotels.</span></div>}
  <div className="next-row"><Link className="secondary-link" href="/planner/hotels"><ChevronLeft size={16}/> Back to hotels</Link><div><b>Costing complete?</b><span>Preview the customer PDF next.</span></div><Link className="primary-cta inline" href="/planner/pdf">Next: Client PDF <ChevronRight size={16}/></Link></div>
 </PlannerChrome></AppShell>
}
