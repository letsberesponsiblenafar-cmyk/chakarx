'use client';
import {useState,type ReactNode} from 'react';
import StepBar from '@/components/StepBar';
import {usePlanner} from '@/components/PlannerProvider';
import {savePlannerItinerary} from '@/lib/save-itinerary';
export default function PlannerChrome({title,eyebrow,children}:{title:string;eyebrow:string;children:ReactNode}){
 const planner=usePlanner();
 const {plan,input,savedItineraryId,markSavedItinerary}=planner;
 const [saving,setSaving]=useState(false);
 const [saveMessage,setSaveMessage]=useState('');
 async function saveChanges(){
  if(saving)return;
  setSaving(true);setSaveMessage('');
  try{const id=await savePlannerItinerary(planner,false);markSavedItinerary(id);setSaveMessage('Changes saved to this client itinerary.');}
  catch(error){setSaveMessage(error instanceof Error?error.message:'Could not save changes.');}
  finally{setSaving(false);}
 }
 return <main className="page planner-page"><div className="planner-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{input.name?`Prepared for ${input.name}.`:'Build a client-ready Kashmir journey with Chakar Experience.'} {plan?`${plan.days} days / ${plan.nights} nights.`:''}</p></div><div className="planner-heading-actions">{savedItineraryId&&<button type="button" className="save-itinerary-button" onClick={saveChanges} disabled={saving}>{saving?'Saving…':'Save changes'}</button>}{plan&&<div className="heading-pill">{plan.stays.map(s=>s.name).join(' · ')}</div>}</div></div>{saveMessage&&<p className="saved-feedback" role="status">{saveMessage}</p>}<StepBar/>{children}</main>
}
