'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useMemo, useState } from 'react';
import { ChevronRight, MapPin, Moon, Plus, Search, Sparkles, Sun } from 'lucide-react';
import { type Destination } from '@/lib/data';
import { usePlanner } from '@/components/PlannerProvider';
import { destinationAbout } from '@/lib/narrative';
import PackageDefaultsEditor from '@/components/PackageDefaultsEditor';

const destinationUrl = (destination: Destination) => `/library/${encodeURIComponent(destination.id || destination.name)}`;

export default function LibraryPage() {
  const { destinationCatalog: destinations, destinationConnection, destinationConnectionError, refreshDestinations } = usePlanner();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('All');
  const [overnight, setOvernight] = useState<'All' | 'Yes' | 'No'>('All');
  const tiers = ['All', 'Iconic', 'Established', 'Secondary', 'Offbeat', 'Iconic Site', 'Seasonal Icon', 'Special'];
  const featured = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'].map((name) => destinations.find((d) => d.name === name)).filter((d): d is Destination => Boolean(d));
  const sightseeingCount = destinations.reduce((total, destination) => total + destination.local_sightseeing.length, 0);
  const list = useMemo(() => destinations.filter((destination) => {
    const hay = `${destination.name} ${destination.district} ${destinationAbout(destination)} ${destination.local_sightseeing.map((sight) => sight.name).join(' ')} ${destination.things_to_do.join(' ')} ${destination.activities.join(' ')}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (tier === 'All' || destination.tier === tier)
      && (overnight === 'All' || (overnight === 'Yes' ? destination.overnight_allowed : !destination.overnight_allowed));
  }), [q, tier, overnight, destinations]);

  return <AppShell><main className="page">
    <div className="planner-heading library-heading"><div><span className="eyebrow">KASHMIR DESTINATION LIBRARY</span><h1>Find the right places for every trip.</h1><p>Open a destination to review its sightseeing places and choose which experiences are available for client itineraries.</p></div><div className="library-heading-actions"><div className="heading-pill">{destinations.length} destinations · {sightseeingCount} sights</div><Link className="primary-cta inline" href="/library/new"><Plus size={17}/> Add destination</Link></div></div>
    {destinationConnection === 'error' && <div className="destination-connection-error" role="alert"><span>Destination changes are unavailable: {destinationConnectionError}</span><button type="button" onClick={() => void refreshDestinations()}>Retry connection</button></div>}
    <section className="library-essentials" aria-label="Essential Kashmir destinations"><div className="library-essentials-intro"><span className="eyebrow">START HERE</span><h2>The four essentials</h2><p>Srinagar is the main base. Gulmarg, Pahalgam and Sonamarg can be day visits on shorter trips or overnight stays when time allows.</p></div><div className="library-essentials-grid">{featured.map((destination, index) => <Link key={destination.id || destination.name} href={destinationUrl(destination)}><span className="library-essential-number">0{index + 1}</span><b>{destination.name}</b><small>{destination.name === 'Srinagar' ? 'Main base & local sightseeing' : `${destination.district} · day visit or overnight`}</small><ChevronRight size={19}/></Link>)}</div></section>
    <section className="library-panel">
      <div className="library-toolbar library-toolbar-enhanced">
        <div className="library-search-heading"><div><span className="eyebrow">EXPLORE THE LIBRARY</span><h2>Browse destinations</h2></div><span>{list.length} results</span></div>
        <div className="library-control-row"><label className="search-wrap"><Search size={20}/><input className="search-input" aria-label="Search destinations" placeholder="Search a place, sight or activity" value={q} onChange={(event) => setQ(event.target.value)}/></label><div className="toggle-set" aria-label="Stay type"><button className={overnight === 'All' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('All')}><MapPin size={15}/> All</button><button className={overnight === 'Yes' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('Yes')}><Moon size={15}/> Overnight</button><button className={overnight === 'No' ? 'toggle active' : 'toggle'} onClick={() => setOvernight('No')}><Sun size={15}/> Day visits</button></div></div>
        <div className="filter-row" aria-label="Destination category">{tiers.map((value) => <button key={value} className={tier === value ? 'filter active' : 'filter'} onClick={() => setTier(value)}>{value}</button>)}</div>
      </div>
      <div className="library-count">Showing <b>{list.length}</b> of {destinations.length} destinations. Select a card to open its full guide.</div>
      {list.length === 0 && <div className="library-empty"><Search size={24}/><b>No destinations match these filters</b><p>Try another search or clear the category and stay filters.</p><button onClick={() => { setQ(''); setTier('All'); setOvernight('All'); }}>Clear filters</button></div>}
      <div className="dest-grid destination-grid-rich">{list.map((destination) => <Link className="dest-card rich" key={destination.id || destination.name} href={destinationUrl(destination)}>
        <div className="dest-card-accent"><span>{destination.tier}</span><span>{destination.district}</span></div>
        <div className="dest-top"><b>{destination.name}</b><ChevronRight size={15}/></div>
        <p className="dest-description">{destinationAbout(destination)}</p>
        <div className="stay-stats"><span><strong>{destination.min_days}</strong>-<strong>{destination.max_days}</strong> days</span><span><strong>{destination.ideal_days}</strong> ideal</span><span>{destination.overnight_allowed ? <><Moon size={15}/> Overnight possible</> : <><Sun size={15}/> Day visit</>}</span></div>
        <div className="card-footer-rich"><span><Sparkles size={15}/> {destination.local_sightseeing.length} sights</span><span>Open guide <ChevronRight size={15}/></span></div>
      </Link>)}</div>
    </section>
    <PackageDefaultsEditor/>
  </main></AppShell>;
}
