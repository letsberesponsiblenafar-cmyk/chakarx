'use client';
import AppShell from '@/components/AppShell';
import { useMemo, useState } from 'react';
import { Check, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import { destinations, type Destination } from '@/lib/data';

export default function LibraryPage() {
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('All');
  const [overnight, setOvernight] = useState<'All' | 'Yes' | 'No'>('All');
  const [selected, setSelected] = useState<Destination | null>(null);
  const [photos, setPhotos] = useState<{ url: string; thumb: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const tiers = ['All', 'Iconic', 'Established', 'Secondary', 'Offbeat', 'Iconic Site', 'Seasonal Icon', 'Special'];

  const list = useMemo(() => destinations.filter((d) => {
    const hay = `${d.name} ${d.description} ${d.district} ${d.highlights.join(' ')} ${d.tags.join(' ')} ${d.things_to_do.join(' ')} ${d.activities.join(' ')}`.toLowerCase();
    const matchQuery = !q || hay.includes(q.toLowerCase());
    const matchTier = tier === 'All' || d.tier === tier;
    const matchOvernight = overnight === 'All' || (overnight === 'Yes' ? d.overnight_allowed : !d.overnight_allowed);
    return matchQuery && matchTier && matchOvernight;
  }), [q, tier, overnight]);

  async function openDestination(d: Destination) {
    setSelected(d); setPhotos([]); setLoading(true);
    try {
      const r = await fetch(`/api/photos?q=${encodeURIComponent(d.photoQuery)}`, { cache: 'no-store' });
      const data = await r.json();
      if (r.ok) setPhotos(Array.isArray(data.photos) ? data.photos.slice(0, 6) : []);
    } catch { /* photo panel is optional */ } finally { setLoading(false); }
  }

  return <AppShell><main className="page">
    <div className="planner-heading"><div><span className="eyebrow">KASHMIR DESTINATION LIBRARY</span><h1>44 destinations, built like a planner database.</h1><p>Every destination now carries a short identity, recommended days and nights, overnight capability, local sightseeing, things to do and activities - ready to be loaded into a trip.</p></div><div className="heading-pill">44 destinations · 184 local sights</div></div>

    <section className="library-panel">
      <div className="library-toolbar library-toolbar-enhanced">
        <div className="filter-row">{tiers.map((x) => <button key={x} className={tier === x ? 'filter active' : 'filter'} onClick={() => setTier(x)}>{x}</button>)}</div>
        <div className="library-control-row"><label className="search-wrap"><Search size={13} /><input className="search-input" placeholder="Search destination, sight, activity or district" value={q} onChange={(e) => setQ(e.target.value)} /></label><div className="toggle-set"><button className={overnight === 'All' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('All')}>All</button><button className={overnight === 'Yes' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('Yes')}>Overnight bases</button><button className={overnight === 'No' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('No')}>Sightseeing only</button></div></div>
      </div>
      <div className="library-count">Showing <b>{list.length}</b> of 44 destinations · click a card to open its full local sightseeing and activity set.</div>
      <div className="dest-grid destination-grid-rich">{list.map((d) => <button className="dest-card rich" key={d.name} onClick={() => openDestination(d)}>
        <div className="dest-card-accent"><span>{d.tier}</span><span>{d.district}</span></div>
        <div className="dest-top"><b>{d.name}</b><ChevronRight size={15} /></div>
        <p className="dest-description">{d.description}</p>
        <div className="stay-stats"><span><strong>{d.min_days}</strong>-<strong>{d.max_days}</strong> days</span><span><strong>{d.ideal_days}</strong> ideal</span><span>{d.overnight_allowed ? <><Check size={11} /> {d.min_nights}-{d.max_nights} nights</> : 'Day sightseeing'}</span></div>
        <div className="highlight-line">{d.highlights.slice(0, 4).join(' · ')}</div>
        <div className="card-footer-rich"><span><Sparkles size={12} /> {d.local_sightseeing.length} local sights</span><span>{d.activities.length} activities</span></div>
      </button>)}</div>
    </section>

    {selected && <div className="destination-backdrop" onClick={() => setSelected(null)}><aside className="destination-drawer" onClick={(e) => e.stopPropagation()}>
      <header className="destination-drawer-head"><div><span className="eyebrow">DESTINATION PROFILE</span><h2>{selected.name}</h2><p>{selected.description}</p></div><button className="close-btn" onClick={() => setSelected(null)}><X size={16} /></button></header>
      <div className="destination-profile-stats"><div><span>Recommended days</span><b>{selected.min_days}-{selected.max_days}</b><small>{selected.ideal_days} ideal</small></div><div><span>Overnight</span><b>{selected.overnight_allowed ? 'Yes' : 'No'}</b><small>{selected.overnight_allowed ? `${selected.min_nights}-${selected.max_nights} nights` : 'Sightseeing stop'}</small></div><div><span>Local sights</span><b>{selected.local_sightseeing.length}</b><small>curated entries</small></div></div>
      <section className="drawer-section"><div className="drawer-section-title"><h3>Local sightseeing</h3><span>{selected.local_sightseeing.length} places</span></div><div className="drawer-sight-grid">{selected.local_sightseeing.map((s) => <div className="drawer-sight-card" key={s.name}><b>{s.name}</b><p>{s.description}</p><div>{s.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>)}</div></div>)}</div></section>
      <section className="drawer-section two-col"><div><div className="drawer-section-title"><h3>Things to do</h3></div><div className="bullet-list">{selected.things_to_do.map((x) => <div key={x}><Check size={13} />{x}</div>)}</div></div><div><div className="drawer-section-title"><h3>Popular activities</h3></div><div className="bullet-list">{selected.activities.map((x) => <div key={x}><Check size={13} />{x}</div>)}</div></div></section>
      <section className="drawer-section"><div className="drawer-section-title"><h3>Photos</h3><span>{loading ? 'Loading...' : photos.length ? 'Wikimedia Commons' : 'No results'}</span></div>{loading ? <div className="photo-loading">Loading destination images...</div> : photos.length ? <div className="photo-grid">{photos.map((p) => <img key={p.url} src={p.thumb || p.url} alt={p.title} />)}</div> : <div className="photo-error">No external images were returned. The destination record still works without photos.</div>}</section>
      <footer className="destination-drawer-foot"><button className="secondary-link" onClick={() => setSelected(null)}>Close profile</button></footer>
    </aside></div>}
  </main></AppShell>;
}
