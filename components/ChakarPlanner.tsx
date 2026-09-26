'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight, Sparkles, MapPin } from 'lucide-react';
import { usePlanner } from '@/components/PlannerProvider';
import { hotelCategories, mealOptions } from '@/lib/data';
import { createPlan } from '@/lib/itinerary';
import { calculateCosts } from '@/lib/costing';

function datePlus(n:number){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function fmtDate(s:string){return new Date(`${s}T12:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}
function money(v:number){return `₹${Math.round(v).toLocaleString('en-IN')}`}

export default function ChakarPlanner(){
 const router=useRouter(); const {input,plan,setInputField,setYoungAges,generate,hotelSelections,costModel}=usePlanner();
 const [busy,setBusy]=useState(false); const [quickError,setQuickError]=useState('');
 const [adultsText,setAdultsText]=useState(String(input.adults));
 const [childrenText,setChildrenText]=useState(String(input.youngAges.length));
 const [budgetText,setBudgetText]=useState(String(input.budget));
 const [ageText,setAgeText]=useState<string[]>(input.youngAges.map(String));
 useEffect(()=>setAdultsText(String(input.adults)),[input.adults]);
 useEffect(()=>setChildrenText(String(input.youngAges.length)),[input.youngAges.length]);
 useEffect(()=>setBudgetText(String(input.budget)),[input.budget]);
 useEffect(()=>setAgeText(input.youngAges.map(String)),[input.youngAges]);
 const arrivals=input.arrival||datePlus(7), departures=input.departure||datePlus(14);
 const preview=plan;
 function submit(){
  setQuickError('');
  try{
   if(!adultsText.trim() || Number(adultsText)<1) throw new Error('Enter at least one adult.');
   if(childrenText.trim() && (!Number.isInteger(Number(childrenText)) || Number(childrenText)<0)) throw new Error('Enter a valid number of children.');
   if(childrenText.trim()!==''&&input.youngAges.some((_,i)=>ageText[i]==='' || !Number.isInteger(Number(ageText[i])))) throw new Error('Enter an age for every child.');
   setBusy(true);
   const effective={...input,adults:Number(adultsText),youngAges:childrenText.trim()===''?[]:input.youngAges,budget:budgetText.trim()===''?0:Number(budgetText),arrival:input.arrival||arrivals,departure:input.departure||departures};
   generate(effective);
   createPlan(effective);
   router.push('/planner/itinerary');
  }catch(e){setQuickError(e instanceof Error?e.message:'Please check the trip details.')}finally{setBusy(false)}
 }
 function addChild(){setYoungAges([...input.youngAges,5])}
 function removeChild(){setYoungAges(input.youngAges.slice(0,-1))}
 function setChildAge(i:number,value:number){
   if(value>14){setInputField('adults',input.adults+1);setYoungAges(input.youngAges.filter((_,idx)=>idx!==i));return}
   const xs=[...input.youngAges];xs[i]=Math.max(0,Math.min(14,value));setYoungAges(xs);
 }
 const people=(Number(adultsText)||0)+(childrenText.trim()===''?0:input.youngAges.length);
 return <main className="page build-trip-page">
   <section className="build-header">
     <div><span className="eyebrow">CHAKAR EXPERIENCE</span><h1>Build Your Trip</h1><p>Start with the essentials. Chakar will use your dates, traveller mix, pickup, budget and itinerary category to build the first route.</p></div>
     <div className="build-header-badge"><Sparkles size={15}/><span>Rule-driven Kashmir planning</span></div>
   </section>
   <div className="page-grid build-grid">
    <section className="editor-card">
      <div className="section-head"><div><span className="eyebrow">TRIP DETAILS</span><h2>Tell us about the trip</h2><p>Every field below directly affects the itinerary, hotel occupancy or customer costing.</p></div><span className="step-chip">STEP 01</span></div>
      <div className="form-section"><label>Traveller's name</label><input value={input.name} onChange={e=>setInputField('name',e.target.value)} placeholder="Enter traveller's name"/></div>
      <div className="form-section"><label>Travel dates</label><div className="two-field"><input aria-label="Arrival date" type="date" value={input.arrival||arrivals} onChange={e=>setInputField('arrival',e.target.value)}/><input aria-label="Departure date" type="date" value={input.departure||departures} onChange={e=>setInputField('departure',e.target.value)}/></div></div>
      <div className="form-section"><label>Pick-up point</label><select value={input.pickup==='Srinagar'?'Srinagar':input.pickup==='Jammu'?'Jammu':'Other'} onChange={e=>setInputField('pickup',e.target.value==='Other'?'':e.target.value)}><option>Srinagar</option><option>Jammu</option><option>Other</option></select>{!['Srinagar','Jammu'].includes(input.pickup)&&<input className="other-pickup" value={input.pickup} onChange={e=>setInputField('pickup',e.target.value)} placeholder="Type your pick-up point"/>}</div>
      <div className="form-section"><label>Adults</label><input className="direct-number" type="number" min="1" value={adultsText} onChange={e=>{const raw=e.target.value;setAdultsText(raw);if(raw!==''&&Number.isInteger(Number(raw))&&Number(raw)>=1)setInputField('adults',Number(raw))}}/></div>
      <div className="form-section"><label>Children <span className="field-note">Age 15+ is automatically counted as an adult</span></label><div className="children-count-row"><input className="direct-number" type="number" min="0" value={childrenText} onChange={e=>{const raw=e.target.value;setChildrenText(raw);if(raw===''||!Number.isInteger(Number(raw))||Number(raw)<0)return;const n=Math.min(30,Number(raw));const xs=[...input.youngAges];while(xs.length<n)xs.push(5);while(xs.length>n)xs.pop();setYoungAges(xs)}}/><div className="children-actions"><button type="button" onClick={removeChild}>−</button><button type="button" onClick={addChild}>+</button></div></div>
       {childrenText.trim()!==''&&input.youngAges.length>0&&<div className="children-age-grid">{input.youngAges.map((age,i)=><label key={i}>Child {i+1} age<input type="number" min="0" max="14" value={ageText[i]??String(age)} onChange={e=>{const raw=e.target.value;setAgeText(xs=>xs.map((x,index)=>index===i?raw:x));if(raw!==''&&Number.isInteger(Number(raw))&&Number(raw)>=0)setChildAge(i,Number(raw))}}/></label>)}</div>}
      </div>
      <div className="form-section"><label>Budget per person</label><div className="money-input"><span>₹</span><input type="number" min="0" step="1000" value={budgetText} onChange={e=>{const raw=e.target.value;setBudgetText(raw);if(raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>=0)setInputField('budget',Number(raw))}}/><small>/ person</small></div><div className="field-note budget-note">{budgetText.trim()===''?'No budget cap entered.':`Group planning reference: ${money((Number(budgetText)||0)*people)} for ${people} traveller${people!==1?'s':''}.`}</div></div>
      <div className="form-section"><label>Itinerary category</label><div className="pill-set category-pills">{hotelCategories.map(x=><button type="button" key={x} className={input.hotelCategory===x?'active':''} onClick={()=>setInputField('hotelCategory',x)}>{x}</button>)}</div></div>
      <div className="form-section"><label>Meal plan</label><div className="pill-set">{mealOptions.map(x=><button type="button" key={x} className={input.mealPlan===x?'active':''} onClick={()=>setInputField('mealPlan',x)}>{x}</button>)}</div></div>
      {quickError&&<div className="form-error">{quickError}</div>}
      <button className="primary-cta next-button" onClick={submit} disabled={busy}>{busy?<><Sparkles size={17}/>Building…</>:<>Next <ChevronRight size={17}/></>}</button>
      <div className="trust-note"><strong>Planning boundary</strong><span>Destination intelligence, route rules and package logic are source-backed. Live road, hotel availability and supplier rates remain verification inputs.</span></div>
    </section>
    <section className="preview-card build-preview">
      <div className="section-head"><div><span className="eyebrow">WHAT HAPPENS NEXT</span><h2>From trip details to a working itinerary</h2><p>Chakar will create the day-wise route first. You will then be able to edit destinations and sightseeing before moving to hotels and costing.</p></div></div>
      <div className="build-flow"><div><span>01</span><b>Itinerary</b><p>Day-by-day destination and local sightseeing with overnight state.</p></div><div><span>02</span><b>Hotels</b><p>Search or type hotels, manage occupancy and internal B2B calculations.</p></div><div><span>03</span><b>Costing</b><p>Accommodation + transport + others + 5% GST + selling range + markup.</p></div><div><span>04</span><b>Client PDF</b><p>Preview the customer document and download a clean non-overlapping PDF.</p></div></div>
      {preview&&<div className="preview-bottom"><div><span>Current draft</span><strong>{preview.days} days</strong></div><div><span>Budget / person</span><strong>{budgetText.trim()===''?'No cap':money(Number(budgetText)||0)}</strong></div><div><span>Travellers</span><strong>{people}</strong></div><div><span>Current total</span><strong>{money(calculateCosts(preview,hotelSelections,costModel).sellingTotal)}</strong></div></div>}
      <div className="build-note"><MapPin size={16}/><span><b>Children rule:</b> enter each child's age. Any age above 14 is automatically moved into Adults so room and costing calculations stay correct.</span></div>
    </section>
   </div>
 </main>
}
