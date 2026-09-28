'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Compass,Database,FileText,Hotel,Menu,Route,X} from 'lucide-react';
import {useState,type ReactNode} from 'react';
export default function AppShell({children}:{children:ReactNode}){
 const path=usePathname();const [open,setOpen]=useState(false);
 const items=[['trip','Build Your Trip','/'],['library','Kashmir Destination Library','/library'],['hotels','Hotel Database','/hotels'],['sources','Sources & Freshness','/sources']] as const;
 return <div className="site-shell">
  <aside className="side-rail">
   <Link className="brand-link" href="/"><img src="/chakar-experience-logo.svg" alt="Chakar Experience"/></Link>
   <div className="brand-caption">DISCOVER KASHMIR</div>
   <nav className="rail-nav">
    {items.map(([key,label,href])=><Link key={key} href={href} className={(key==='trip'?path.startsWith('/planner')||path==='/':path===href)?'active':''} onClick={()=>setOpen(false)}>{key==='trip'?<Route size={18}/>:key==='library'?<Database size={18}/>:key==='hotels'?<Hotel size={18}/>:<Compass size={18}/>}<span>{label}</span></Link>)}
   </nav>
   <div className="rail-spacer"/>
   <div className="rail-card"><span className="live-dot"/><div><b>Chakar planning engine</b><small>Destinations · route · hotels · costing</small></div></div>
   <Link className="rail-footer-link" href="/planner/pdf"><FileText size={15}/> Client itinerary PDF</Link>
  </aside>
  <div className="main-shell">
   <header className="topbar"><div className="crumb"><b>Chakar Experience</b><span>/</span><span>{path.startsWith('/library')?'Kashmir Destination Library':path.startsWith('/sources')?'Sources & Freshness':path.startsWith('/hotels')?'Hotel Database':path==='/planner/hotels'?'Hotels':path==='/planner/costing'?'Costing':path==='/planner/pdf'?'Client PDF':'Build Your Trip'}</span></div><div className="topbar-right"><span className="evidence-pill"><i/>Evidence-aware</span><Link href="/" className="new-trip"><Route size={14}/> New trip</Link><button className="mobile-trigger" onClick={()=>setOpen(v=>!v)}>{open?<X size={20}/>:<Menu size={20}/>}</button></div></header>
   {open&&<div className="mobile-menu"><Link href="/"><Route size={17}/>Build Your Trip</Link><Link href="/library"><Database size={17}/>Kashmir Destination Library</Link><Link href="/hotels"><Hotel size={17}/>Hotel Database</Link><Link href="/sources"><Compass size={17}/>Sources & Freshness</Link><Link href="/planner/pdf"><FileText size={17}/>Client itinerary PDF</Link></div>}
   {children}
  </div>
 </div>
}
