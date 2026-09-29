'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, FileText, FolderOpen, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { usePlanner, type ItinerarySnapshot } from '@/components/PlannerProvider';
import type { SavedItinerarySummary } from '@/lib/itinerary-store';

function date(value: string | null) {
  if (!value) return 'Date to confirm';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export default function SavedItineraries() {
  const router = useRouter();
  const { loadSavedItinerary, reset } = usePlanner();
  const [items, setItems] = useState<SavedItinerarySummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/itineraries', { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load itineraries.');
      setItems(Array.isArray(payload.itineraries) ? payload.itineraries : []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load itineraries.')).finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => items.filter((item) => `${item.client_name} ${item.arrival || ''} ${item.departure || ''}`.toLowerCase().includes(query.toLowerCase().trim())), [items, query]);
  async function open(id: string) {
    if (opening) return;
    setOpening(id); setError('');
    try {
      const response = await fetch(`/api/itineraries/${id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.itinerary?.snapshot?.plan) throw new Error(payload.error || 'Could not open itinerary.');
      loadSavedItinerary(id, payload.itinerary.snapshot as ItinerarySnapshot);
      router.push('/planner/itinerary');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open itinerary.');
      setOpening(null);
    }
  }
  return <AppShell><main className="page saved-page">
    <div className="saved-heading"><div><span className="eyebrow">CHAKAR CLIENT WORKSPACE</span><h1>Saved Itineraries</h1><p>Open a client trip to edit its days, hotels and costing, then save changes or download a revised PDF.</p></div><button type="button" className="primary-cta inline" onClick={reset}><Plus size={16}/> Build New</button></div>
    <div className="saved-toolbar"><div className="saved-search"><Search size={18}/><input aria-label="Search saved itineraries" placeholder="Search by client or travel date" value={query} onChange={(event) => setQuery(event.target.value)}/></div><span>{filtered.length} {filtered.length === 1 ? 'itinerary' : 'itineraries'}</span></div>
    {error && <div className="saved-error" role="alert">{error}</div>}
    {loading ? <div className="empty-panel saved-empty"><FolderOpen size={28}/><h2>Loading saved itineraries…</h2></div> : filtered.length ? <div className="saved-grid">{filtered.map((item) => <article className="saved-card" key={item.id}><div className="saved-card-top"><span className="saved-file-icon"><FileText size={21}/></span><span className="saved-updated">Updated {date(item.updated_at)}</span></div><h2>{item.client_name}</h2><p><CalendarDays size={15}/>{date(item.arrival)} – {date(item.departure)}</p><div className="saved-facts"><span>{item.days} days / {item.nights} nights</span><span>₹{Math.round(item.package_total).toLocaleString('en-IN')}</span></div><div className="saved-card-footer"><small>{item.download_count} PDF {item.download_count === 1 ? 'download' : 'downloads'}</small><button type="button" onClick={() => open(item.id)} disabled={Boolean(opening)}>Open & edit <ArrowRight size={15}/></button></div></article>)}</div> : <div className="empty-panel saved-empty"><FolderOpen size={31}/><h2>{query ? 'No matching clients' : 'No downloaded itineraries yet'}</h2><p>{query ? 'Try another client name or date.' : 'Download a client PDF and the itinerary will appear here automatically.'}</p>{!query && <Link className="secondary-link" href="/">Build a trip <ArrowRight size={15}/></Link>}</div>}
  </main></AppShell>;
}
