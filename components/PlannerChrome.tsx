'use client';
import type {ReactNode} from 'react';
import StepBar from '@/components/StepBar';
import {usePlanner} from '@/components/PlannerProvider';
export default function PlannerChrome({title,eyebrow,children}:{title:string;eyebrow:string;children:ReactNode}){
 const {plan,input}=usePlanner();
 return <main className="page planner-page"><div className="planner-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{input.name?`Prepared for ${input.name}.`:'Build a client-ready Kashmir journey with Chakar Experience.'} {plan?`${plan.days} days / ${plan.nights} nights.`:''}</p></div>{plan&&<div className="heading-pill">{plan.stays.map(s=>s.name).join(' · ')}</div>}</div><StepBar/>{children}</main>
}
