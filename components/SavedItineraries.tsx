'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, Copy, Download, FileText, FolderOpen, LoaderCircle, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { usePlanner, type ItinerarySnapshot } from '@/components/PlannerProvider';
import type { SavedItinerarySummary } from '@/lib/itinerary-store';

function date(value: string | null) {
  if (!value) return 'Date to confirm';
  const timestamp = value.includes('T');
  const parsed = new Date(timestamp ? value : `${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', ...(timestamp ? { timeZone: 'Asia/Kolkata' } : {}),
  });
}
function createdDay(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const field = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${field('year')}-${field('month')}-${field('day')}`;
}
function createdTime(value: string) {
  return new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}
function ItineraryMenu({ item, expanded, busy, copying, onToggle, onClose, onCopy }: {
  item: SavedItinerarySummary; expanded: boolean; busy: boolean; copying: boolean;
  onToggle: () => void; onClose: () => void; onCopy: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuItem = useRef<HTMLButtonElement>(null);
  const wasCopying = useRef(false);
  useEffect(() => {
    if (wasCopying.current && !copying) trigger.current?.focus();
    wasCopying.current = copying;
  }, [copying]);
  useEffect(() => {
    if (!expanded) return;
    menuItem.current?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [expanded, onClose]);
  return <div className="saved-menu" ref={container} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onClose();
  }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); trigger.current?.focus(); }
  }}>
    <button type="button" className="saved-menu-trigger" ref={trigger} id={`itinerary-options-${item.id}`}
      aria-label={copying ? `Creating a copy of ${item.client_name}` : `More options for ${item.client_name}, created ${date(item.created_at)} at ${createdTime(item.created_at)}`}
      aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded ? `itinerary-menu-${item.id}` : undefined}
      disabled={busy} onClick={onToggle} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!expanded) onToggle(); else menuItem.current?.focus(); }
      }}>
      {copying ? <LoaderCircle size={18} className="saved-copy-spinner" aria-hidden="true"/> : <MoreHorizontal size={20} aria-hidden="true"/>}
    </button>
    {expanded && <div className="saved-menu-panel" role="menu" id={`itinerary-menu-${item.id}`} aria-labelledby={`itinerary-options-${item.id}`}>
      <button type="button" role="menuitem" ref={menuItem} disabled={busy} onClick={onCopy} onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); menuItem.current?.focus(); }
      }}><Copy size={16} aria-hidden="true"/> Create a copy</button>
    </div>}
  </div>;
}
export default function SavedItineraries() {
  const router = useRouter();
  const { loadSavedItinerary, reset } = usePlanner();
  const [items, setItems] = useState<SavedItinerarySummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const operation = useRef<string | null>(null);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/itineraries', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load itineraries.');
      setItems(Array.isArray(payload.itineraries) ? payload.itineraries : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load itineraries.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => items.filter((item) => `${item.client_name} ${item.arrival || ''} ${item.departure || ''} ${item.created_at} ${date(item.created_at)}`.toLowerCase().includes(query.toLowerCase().trim())), [items, query]);
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; items: SavedItinerarySummary[] }>();
    for (const item of filtered) {
      const key = createdDay(item.created_at);
      if (!groups.has(key)) groups.set(key, { label: date(item.created_at), items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.values()];
  }, [filtered]);
  async function open(id: string, destination: '/planner/destinations' | '/planner/pdf') {
    if (operation.current) return;
    operation.current = id;
    setOpening(id); setMenu(null); setError(''); setFeedback('');
    try {
      const response = await fetch(`/api/itineraries/${id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.itinerary?.snapshot?.plan) throw new Error(payload.error || 'Could not open itinerary.');
      loadSavedItinerary(id, payload.itinerary.snapshot as ItinerarySnapshot);
      router.push(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open itinerary.');
      setOpening(null);
      operation.current = null;
    }
  }
  async function copy(item: SavedItinerarySummary) {
    if (operation.current) return;
    operation.current = item.id;
    setCopying(item.id); setMenu(null); setError(''); setFeedback('');
    try {
      const response = await fetch(`/api/itineraries/${item.id}/copy`, { method: 'POST', cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.itinerary?.id || payload.itinerary.id === item.id) throw new Error(payload.error || 'Could not create a copy.');
      const created = payload.itinerary as SavedItinerarySummary;
      setItems((previous) => [created, ...previous.filter((entry) => entry.id !== created.id)]
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
      setFeedback(`A separate copy of ${item.client_name}'s itinerary is saved. Open the new card to edit it.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a copy.');
    } finally {
      operation.current = null;
      setCopying(null);
    }
  }
  const busy = Boolean(opening || copying);
  return <AppShell><main className="page saved-page">
    <div className="saved-heading"><div><span className="eyebrow">CHAKAR CLIENT WORKSPACE</span><h1>Saved Itineraries</h1><p>Open a client trip to edit its days, hotels and costing, then save changes or download a revised PDF.</p></div><button type="button" className="primary-cta inline" onClick={reset} disabled={busy}><Plus size={16}/> Build New</button></div>
    <div className="saved-toolbar"><div className="saved-search"><Search size={18}/><input aria-label="Search saved itineraries" placeholder="Search by client or travel date" value={query} onChange={(event) => setQuery(event.target.value)}/></div><span>{filtered.length} {filtered.length === 1 ? 'itinerary' : 'itineraries'}</span></div>
    {error && <div className="saved-error" role="alert">{error}</div>}
    {feedback && <div className="saved-feedback" role="status">{feedback}</div>}
    {copying && <span className="saved-copy-status" role="status">Creating a separate saved copy…</span>}
    {loading ? <div className="empty-panel saved-empty"><FolderOpen size={28}/><h2>Loading saved itineraries…</h2></div> : grouped.length ? grouped.map((group) => <section className="saved-date-group" key={group.label}><div className="saved-date-heading"><div><span className="eyebrow">CREATED ON</span><h2>{group.label}</h2></div><span>{group.items.length} {group.items.length === 1 ? 'itinerary' : 'itineraries'}</span></div><div className="saved-grid">{group.items.map((item) => <article className="saved-card" key={item.id}>
      <div className="saved-card-top"><span className="saved-file-icon"><FileText size={21}/></span><div className="saved-card-top-actions"><span className="saved-updated">Created {createdTime(item.created_at)}<br/>Updated {date(item.updated_at)}</span>
        <ItineraryMenu item={item} expanded={menu === item.id} busy={busy} copying={copying === item.id}
          onToggle={() => setMenu((current) => current === item.id ? null : item.id)} onClose={() => setMenu(null)} onCopy={() => void copy(item)}/>
      </div></div>
      <h2>{item.client_name}</h2><p><CalendarDays size={15}/>{date(item.arrival)} – {date(item.departure)}</p><div className="saved-facts"><span>{item.days} days / {item.nights} nights</span><span>₹{Math.round(item.package_total).toLocaleString('en-IN')}</span></div>
      <div className="saved-card-footer"><small>{item.download_count} PDF {item.download_count === 1 ? 'download' : 'downloads'}</small><div className="saved-card-actions"><button type="button" onClick={() => open(item.id, '/planner/destinations')} disabled={busy}>Open & edit <ArrowRight size={15}/></button><button type="button" className="saved-pdf-button" onClick={() => open(item.id, '/planner/pdf')} disabled={busy}><Download size={14}/> Open PDF</button></div></div>
    </article>)}</div></section>) : <div className="empty-panel saved-empty"><FolderOpen size={31}/><h2>{error ? 'Could not load saved itineraries' : query ? 'No matching clients' : 'No saved itineraries yet'}</h2><p>{error ? 'Check the database connection and try again.' : query ? 'Try another client name or date.' : 'Each trip is saved automatically when its PDF page opens.'}</p>{error ? <button type="button" className="secondary-link" onClick={()=>void load()}>Retry</button> : !query && <Link className="secondary-link" href="/">Build a trip <ArrowRight size={15}/></Link>}</div>}
  </main></AppShell>;
}
