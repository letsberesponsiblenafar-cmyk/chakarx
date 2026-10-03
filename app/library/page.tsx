'use client';
import AppShell from '@/components/AppShell';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MapPin, Moon, Plus, Search, Sparkles, Sun, X } from 'lucide-react';
import { type Destination } from '@/lib/data';
import { usePlanner } from '@/components/PlannerProvider';
import DestinationEditor from '@/components/DestinationEditor';
import { defaultDayNote } from '@/lib/narrative';

export default function LibraryPage() {
  const { destinationCatalog: destinations, destinationConnection, destinationConnectionError, refreshDestinations } = usePlanner();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('All');
  const [overnight, setOvernight] = useState<'All' | 'Yes' | 'No'>('All');
  const [selected, setSelected] = useState<Destination | null>(null);
  const [editor,setEditor] = useState<Destination | 'new' | null>(null);
  const [savingActivity,setSavingActivity] = useState(false);
  const [activityError,setActivityError] = useState('');
  const [photos, setPhotos] = useState<{ url: string; thumb: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const tiers = ['All', 'Iconic', 'Established', 'Secondary', 'Offbeat', 'Iconic Site', 'Seasonal Icon', 'Special'];
  const featured = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'].map((name)=>destinations.find((d)=>d.name===name)).filter((d):d is Destination=>Boolean(d));
  const sightseeingCount=destinations.reduce((total,d)=>total+d.local_sightseeing.length,0);

  useEffect(()=>{
    if(!selected)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null)};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[selected]);

  const list = useMemo(() => destinations.filter((d) => {
    const hay = `${d.name} ${d.description} ${d.district} ${d.highlights.join(' ')} ${d.tags.join(' ')} ${d.things_to_do.join(' ')} ${d.activities.join(' ')}`.toLowerCase();
    const matchQuery = !q || hay.includes(q.toLowerCase());
    const matchTier = tier === 'All' || d.tier === tier;
    const matchOvernight = overnight === 'All' || (overnight === 'Yes' ? d.overnight_allowed : !d.overnight_allowed);
    return matchQuery && matchTier && matchOvernight;
  }), [q, tier, overnight, destinations]);

  async function openDestination(d: Destination) {
    setSelected(d); setActivityError(''); setPhotos([]); setLoading(true);
    try {
      const r = await fetch(`/api/photos?q=${encodeURIComponent(d.photoQuery)}`, { cache: 'no-store' });
      const data = await r.json();
      if (r.ok) setPhotos(Array.isArray(data.photos) ? data.photos.slice(0, 6) : []);
    } catch { /* photo panel is optional */ } finally { setLoading(false); }
  }
  async function toggleActivity(kind: 'enabled_things_to_do' | 'enabled_activities', item: string) {
    if (!selected || savingActivity) return;
    const previous=selected;
    const active=selected[kind] || [];
    const next={...selected,id:selected.id||selected.name,[kind]:active.includes(item)?active.filter((value)=>value!==item):[...active,item]};
    setSelected(next); setSavingActivity(true); setActivityError('');
    try {
      const response=await fetch('/api/destinations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Could not save activity selection.');
      await refreshDestinations();
    } catch(error) { setSelected(previous); setActivityError(error instanceof Error?error.message:'Could not save activity selection.'); }
    finally { setSavingActivity(false); }
  }

  return <AppShell><main className="page">
    <div className="planner-heading library-heading"><div><span className="eyebrow">KASHMIR DESTINATION LIBRARY</span><h1>Find the right places for every trip.</h1><p>Explore the essential Kashmir circuit, then add day visits and overnight stops as the trip grows. Open any destination for sights, activities and stay guidance.</p></div><div className="library-heading-actions"><div className="heading-pill">{destinations.length} destinations · {sightseeingCount} sights</div><button type="button" className="primary-cta inline" onClick={() => setEditor('new')} disabled={destinationConnection!=='ready'}><Plus size={17}/> Add destination</button></div></div>
    {destinationConnection==='error' && <div className="destination-connection-error" role="alert"><span>Destination changes are unavailable: {destinationConnectionError}</span><button type="button" onClick={() => void refreshDestinations()}>Retry connection</button></div>}

    <section className="library-essentials" aria-label="Essential Kashmir destinations"><div className="library-essentials-intro"><span className="eyebrow">START HERE</span><h2>The four essentials</h2><p>Srinagar is the main base. Gulmarg, Pahalgam and Sonamarg can be day visits on shorter trips or overnight stays when time allows.</p></div><div className="library-essentials-grid">{featured.map((d,index)=><button key={d.name} type="button" onClick={()=>openDestination(d)}><span className="library-essential-number">0{index+1}</span><b>{d.name}</b><small>{d.name==='Srinagar'?'Main base & local sightseeing':`${d.district} · day visit or overnight`}</small><ChevronRight size={19}/></button>)}</div></section>

    <section className="library-panel">
      <div className="library-toolbar library-toolbar-enhanced">
        <div className="library-search-heading"><div><span className="eyebrow">EXPLORE THE LIBRARY</span><h2>Browse destinations</h2></div><span>{list.length} results</span></div>
        <div className="library-control-row"><label className="search-wrap"><Search size={20} /><input className="search-input" aria-label="Search destinations" placeholder="Search a place, sight or activity" value={q} onChange={(e) => setQ(e.target.value)} /></label><div className="toggle-set" aria-label="Stay type"><button className={overnight === 'All' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('All')}><MapPin size={15}/> All</button><button className={overnight === 'Yes' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('Yes')}><Moon size={15}/> Overnight</button><button className={overnight === 'No' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('No')}><Sun size={15}/> Day visits</button></div></div>
        <div className="filter-row" aria-label="Destination category">{tiers.map((x) => <button key={x} className={tier === x ? 'filter active' : 'filter'} onClick={() => setTier(x)}>{x}</button>)}</div>
      </div>
      <div className="library-count">Showing <b>{list.length}</b> of {destinations.length} destinations. Select a card to see the full guide.</div>
      {list.length===0&&<div className="library-empty"><Search size={24}/><b>No destinations match these filters</b><p>Try another search or clear the category and stay filters.</p><button onClick={()=>{setQ('');setTier('All');setOvernight('All')}}>Clear filters</button></div>}
      <div className="dest-grid destination-grid-rich">{list.map((d) => <button className="dest-card rich" key={d.name} onClick={() => openDestination(d)}>
        <div className="dest-card-accent"><span>{d.tier}</span><span>{d.district}</span></div>
        <div className="dest-top"><b>{d.name}</b><ChevronRight size={15} /></div>
        <p className="dest-description">{d.description}</p>
        <div className="stay-stats"><span><strong>{d.min_days}</strong>-<strong>{d.max_days}</strong> days</span><span><strong>{d.ideal_days}</strong> ideal</span><span>{d.overnight_allowed ? <><Moon size={15} /> Overnight possible</> : <><Sun size={15}/> Day visit</>}</span></div>
        <div className="highlight-line">{d.highlights.slice(0, 4).join(' · ')}</div>
        <div className="card-footer-rich"><span><Sparkles size={15} /> {d.local_sightseeing.length} sights</span><span>Open guide <ChevronRight size={15}/></span></div>
      </button>)}</div>
    </section>

    {selected && <div className="destination-backdrop" onClick={() => setSelected(null)}><aside className="destination-drawer" role="dialog" aria-modal="true" aria-label={`${selected.name} destination guide`} onClick={(e) => e.stopPropagation()}>
      <header className="destination-drawer-head"><div><span className="eyebrow">DESTINATION GUIDE · {selected.district}</span><h2>{selected.name}</h2><p>{selected.description}</p></div><button className="close-btn" aria-label="Close destination guide" onClick={() => setSelected(null)}><X size={20} /></button></header>
      <section className="drawer-section destination-note"><div className="drawer-section-title"><h3>About this day</h3></div><p>{selected.day_note || defaultDayNote(selected)}</p><small>This note is used in the day-wise client itinerary when {selected.name} is selected.</small></section>
      <div className="destination-profile-stats"><div><span>Recommended days</span><b>{selected.min_days}-{selected.max_days}</b><small>{selected.ideal_days} ideal</small></div><div><span>Overnight</span><b>{selected.overnight_allowed ? 'Yes' : 'No'}</b><small>{selected.overnight_allowed ? `${selected.min_nights}-${selected.max_nights} nights` : 'Sightseeing stop'}</small></div><div><span>Sights</span><b>{selected.local_sightseeing.length}</b><small>curated entries</small></div></div>
      <section className="drawer-section"><div className="drawer-section-title"><h3>{selected.name==='Srinagar'?'Local sightseeing':`${selected.name} sightseeing`}</h3><span>{selected.local_sightseeing.length} places</span></div><div className="drawer-sight-grid">{selected.local_sightseeing.map((s) => <div className="drawer-sight-card" key={s.name}><b>{s.name}</b><p>{s.description}</p><div>{s.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>)}</div></div>)}</div></section>
      <section className="drawer-section two-col"><div><div className="drawer-section-title"><h3>Things to do</h3></div><div className="bullet-list destination-toggle-list">{selected.things_to_do.map((x) => <label key={x} className={(selected.enabled_things_to_do||[]).includes(x)?'destination-enabled':'destination-disabled'}><input type="checkbox" checked={(selected.enabled_things_to_do||[]).includes(x)} disabled={savingActivity} onChange={() => void toggleActivity('enabled_things_to_do',x)}/>{x}</label>)}</div></div><div><div className="drawer-section-title"><h3>Popular activities</h3></div><div className="bullet-list destination-toggle-list">{selected.activities.map((x) => <label key={x} className={(selected.enabled_activities||[]).includes(x)?'destination-enabled':'destination-disabled'}><input type="checkbox" checked={(selected.enabled_activities||[]).includes(x)} disabled={savingActivity} onChange={() => void toggleActivity('enabled_activities',x)}/>{x}</label>)}</div></div></section>
      {activityError && <p className="destination-editor-error" role="alert">{activityError}</p>}
      <section className="drawer-section"><div className="drawer-section-title"><h3>Photos</h3><span>{loading ? 'Loading...' : photos.length ? 'Wikimedia Commons' : 'No results'}</span></div>{loading ? <div className="photo-loading">Loading destination images...</div> : photos.length ? <div className="photo-grid">{photos.map((p) => <img key={p.url} src={p.thumb || p.url} alt={p.title} />)}</div> : <div className="photo-error">No external images were returned. The destination record still works without photos.</div>}</section>
      <footer className="destination-drawer-foot"><button className="secondary-link" onClick={() => setSelected(null)}>Close profile</button><button type="button" className="primary-cta inline" onClick={() => { setEditor(selected); setSelected(null); }} disabled={destinationConnection!=='ready'}>Edit destination</button></footer>
    </aside></div>}
    {editor && <DestinationEditor key={editor==='new'?'new':editor.id||editor.name} initial={editor==='new'?undefined:editor} onClose={() => setEditor(null)} onSaved={async () => { await refreshDestinations(); setEditor(null); }}/>}
  </main></AppShell>;
}
