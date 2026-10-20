'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Compass,Database,FolderOpen,Hotel,LogOut,Menu,Plus,Route,X} from 'lucide-react';
import {useState,type ReactNode} from 'react';
import {usePlanner} from '@/components/PlannerProvider';
import './app-shell.css';
export default function AppShell({children}:{children:ReactNode}){
 const path=usePathname();const [open,setOpen]=useState(false);
 const [signingOut,setSigningOut]=useState(false);const [signOutError,setSignOutError]=useState('');
 const {reset}=usePlanner();
 function buildNew(){setOpen(false);reset();}
 async function signOut(){if(signingOut)return;setSigningOut(true);setSignOutError('');try{const response=await fetch('/api/auth/logout',{method:'POST',signal:AbortSignal.timeout(15000)});if(!response.ok&&response.status!==401)throw new Error('Could not sign out. Please try again.');window.location.assign('/login');}catch{setSignOutError('Could not sign out. Check your connection and try again.');setSigningOut(false);}}
 const items=[['trip','Build Your Trip','/'],['saved','Saved Itineraries','/saved-itineraries'],['library','Kashmir Destination Library','/library'],['hotels','Hotel Database','/hotels'],['sources','Sources & Freshness','/sources']] as const;
 return <div className="site-shell">
  <aside className="side-rail">
   <Link className="brand-link" href="/"><span className="original-logo" role="img" aria-label="Chakar Experience"/></Link>
   <div className="brand-caption">DISCOVER KASHMIR</div>
   <nav className="rail-nav" aria-label="Main navigation">
    <button type="button" className="rail-build-new" onClick={buildNew}><Plus size={18}/><span>Build New</span></button>
    {items.map(([key,label,href])=><Link key={key} href={href} className={(key==='trip'?path.startsWith('/planner')||path==='/':key==='library'?path.startsWith('/library'):path===href)?'active':''} onClick={()=>setOpen(false)}>{key==='trip'?<Route size={18}/>:key==='saved'?<FolderOpen size={18}/>:key==='library'?<Database size={18}/>:key==='hotels'?<Hotel size={18}/>:<Compass size={18}/>}<span>{label}</span></Link>)}
   </nav>
   <div className="rail-spacer"/>
   <div className="rail-card"><span className="live-dot"/><div><b>Chakar planning engine</b><small>Destinations · route · hotels · costing</small></div></div>
   <button className="rail-footer-link admin-logout" disabled={signingOut} onClick={signOut}><LogOut size={15}/> {signingOut?'Signing out…':'Sign out'}</button>
  </aside>
  <div className="main-shell">
   <header className="topbar"><div className="crumb"><b>Chakar Experience</b><span>/</span><span>{path.startsWith('/saved-itineraries')?'Saved Itineraries':path.startsWith('/library')?'Kashmir Destination Library':path.startsWith('/sources')?'Sources & Freshness':path.startsWith('/hotels')?'Hotel Database':path==='/planner/destinations'?'Destinations':path==='/planner/hotels'?'Hotels':path==='/planner/activities-transport'?'Activities & Transport':path==='/planner/itinerary'?'Itinerary':path==='/planner/costing'?'Costing':path==='/planner/pdf'?'Client PDF':'Build Your Trip'}</span></div><div className="topbar-right"><span className="evidence-pill"><i/>Evidence-aware</span><button type="button" onClick={buildNew} className="new-trip"><Plus size={14}/> Build New</button><button type="button" className="mobile-trigger" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls="mobile-main-navigation" onClick={()=>setOpen(v=>!v)}>{open?<X size={20}/>:<Menu size={20}/>}</button></div></header>
   {open&&<nav className="mobile-menu" id="mobile-main-navigation" aria-label="Mobile navigation"><button type="button" className="rail-build-new" onClick={buildNew}><Plus size={17}/>Build New</button>{items.map(([key,label,href])=><Link key={key} href={href} onClick={()=>setOpen(false)}>{key==='trip'?<Route size={17}/>:key==='saved'?<FolderOpen size={17}/>:key==='library'?<Database size={17}/>:key==='hotels'?<Hotel size={17}/>:<Compass size={17}/>}<span>{label}</span></Link>)}<button type="button" onClick={signOut}><LogOut size={17}/>Sign out</button></nav>}
   {signOutError&&<div className="admin-alert" role="alert">{signOutError}</div>}
   {children}
  </div>
 </div>
}
