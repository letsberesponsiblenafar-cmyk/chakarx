'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
const steps=[['01','Destinations','/planner/destinations'],['02','Hotels','/planner/hotels'],['03','Activities & Transport','/planner/activities-transport'],['04','Itinerary','/planner/itinerary'],['05','Costing','/planner/costing'],['06','Client PDF','/planner/pdf'],['07','Saved Itineraries','/saved-itineraries']] as const;
export default function StepBar(){const p=usePathname();return <div className="stepbar">{steps.map(([n,label,href],i)=><div className="step-wrap" key={href}><Link href={href} className={(p===href||p==='/'&&i===0)?'step active':'step'}><span>{n}</span><b>{label}</b></Link>{i<steps.length-1&&<span className="step-line"/>}</div>)}</div>}
