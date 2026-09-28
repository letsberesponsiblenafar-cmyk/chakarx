'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft,Save,Trash2} from 'lucide-react';
import type {Hotel} from '@/lib/data';
import {usePlanner} from '@/components/PlannerProvider';
type Draft=Partial<Hotel>;
const fields:Array<{key:keyof Hotel;label:string;type?:string;placeholder?:string}>= [
  {key:'destination',label:'Destination'},{key:'name',label:'Hotel name'},{key:'normalizedCategory',label:'Category'},{key:'starRating',label:'Star rating',type:'number'},
  {key:'mapB2B',label:'MAP B2B rate',type:'number'},{key:'extraBedB2B',label:'Extra bed B2B',type:'number'},{key:'cnbB2B',label:'CNB B2B',type:'number'},
  {key:'address',label:'Address'},{key:'roomType',label:'Room type'},{key:'website',label:'Website',type:'url'},
  {key:'sourceCategory',label:'Supplier category'},{key:'rateValidity',label:'Rate validity'},{key:'availabilityStatus',label:'Availability status'},
];
export default function HotelEditor({initialHotel}:{initialHotel?:Hotel}){
  const router=useRouter();const {replaceHotelDatabase}=usePlanner();const [hotel,setHotel]=useState<Draft>(initialHotel||{destination:'Srinagar',name:'',normalizedCategory:'Budget',sourceType:'Admin entry'});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  function update(key:keyof Hotel,value:string){setHotel(h=>({...h,[key]:['starRating','mapB2B','extraBedB2B','cnbB2B'].includes(key)?value===''?null:Number(value):value}));}
  async function refreshPlanner(){const r=await fetch('/api/hotels',{cache:'no-store'});if(r.ok)replaceHotelDatabase((await r.json()).hotels);}
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{const r=await fetch(initialHotel?`/api/hotels/${encodeURIComponent(initialHotel.id)}`:'/api/hotels',{method:initialHotel?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(hotel)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not save hotel.');await refreshPlanner();setMessage('Hotel saved to the shared database.');if(!initialHotel)router.replace(`/hotels/${encodeURIComponent(data.hotel.id)}`);else router.refresh();}catch(e){setError(e instanceof Error?e.message:'Could not save hotel.')}finally{setBusy(false)}}
  async function remove(){if(!initialHotel||!window.confirm(`Delete ${initialHotel.name}? This removes the hotel from the shared master.`))return;setBusy(true);setError('');try{const r=await fetch(`/api/hotels/${encodeURIComponent(initialHotel.id)}`,{method:'DELETE'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not delete hotel.');await refreshPlanner();router.replace('/hotels');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Could not delete hotel.');setBusy(false)}}
  return <main className="page admin-page"><Link className="admin-back" href="/hotels"><ArrowLeft size={16}/> Hotel dashboard</Link><div className="admin-heading"><div><span className="eyebrow">{initialHotel?'HOTEL PROFILE':'NEW HOTEL'}</span><h1>{initialHotel?.name||'Add a hotel'}</h1><p>Changes here update the shared hotel master used by the itinerary builder.</p></div>{initialHotel&&<span className="admin-security">ID · {initialHotel.id}</span>}</div>{error&&<div className="admin-alert">{error}</div>}{message&&<div className="admin-success">{message}</div>}<form className="admin-editor" onSubmit={save}><div className="admin-editor-grid">{fields.map(f=><label key={f.key}>{f.label}<input type={f.type||'text'} min={f.type==='number'?'0':undefined} max={f.key==='starRating'?'5':undefined} value={String(hotel[f.key]??'')} onChange={e=>update(f.key,e.target.value)} required={f.key==='destination'||f.key==='name'} placeholder={f.placeholder}/></label>)}<label className="wide">Internal notes<textarea value={hotel.notes||''} onChange={e=>update('notes',e.target.value)} rows={4}/></label></div><div className="admin-editor-actions"><button className="primary-cta inline" disabled={busy}><Save size={16}/>{busy?'Saving…':'Save hotel'}</button>{initialHotel&&<button className="secondary-link danger" type="button" onClick={remove} disabled={busy}><Trash2 size={15}/> Delete hotel</button>}</div></form></main>;
}
