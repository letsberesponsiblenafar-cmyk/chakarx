'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { usePlanner } from '@/components/PlannerProvider';
import type { Destination } from '@/lib/data';
import { defaultDayNote } from '@/lib/narrative';

export default function DestinationPage() {
  const { id } = useParams<{ id: string }>();
  const { destinationCatalog, destinationConnection, destinationConnectionError, refreshDestinations } = usePlanner();
  const fromCatalog = destinationCatalog.find((item) => item.id === id || item.name === id);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<{ url: string; thumb: string; title: string }[]>([]);
  useEffect(() => { if (fromCatalog) setDestination(fromCatalog); }, [fromCatalog]);
  useEffect(() => {
    if (!destination?.photoQuery) return;
    let current = true;
    setPhotos([]);
    fetch(`/api/photos?q=${encodeURIComponent(destination.photoQuery)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (current) setPhotos(Array.isArray(payload?.photos) ? payload.photos.slice(0, 6) : []); })
      .catch(() => {});
    return () => { current = false; };
  }, [destination?.photoQuery]);

  async function toggle(kind: 'enabled_things_to_do' | 'enabled_activities', item: string) {
    if (!destination || saving) return;
    const previous = destination;
    const active = destination[kind] || [];
    const next = { ...destination, id: destination.id || destination.name,
      [kind]: active.includes(item) ? active.filter((value) => value !== item) : [...active, item] };
    setDestination(next); setSaving(true); setError('');
    try {
      const response = await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save experience selection.');
      await refreshDestinations();
    } catch (cause) { setDestination(previous); setError(cause instanceof Error ? cause.message : 'Could not save experience selection.'); }
    finally { setSaving(false); }
  }

  if (!destination) return <AppShell><main className="page destination-page"><Link className="secondary-link" href="/library"><ArrowLeft size={16}/> Destination library</Link><div className="empty-panel"><h2>{destinationConnection === 'loading' ? 'Loading destination…' : 'Destination not found'}</h2><p>{destinationConnection === 'error' ? destinationConnectionError : 'Choose a destination from the library.'}</p></div></main></AppShell>;
  const editUrl = `/library/${encodeURIComponent(destination.id || destination.name)}/edit`;
  const selectedThings = destination.enabled_things_to_do || [];
  const selectedActivities = destination.enabled_activities || [];
  return <AppShell><main className="page destination-page">
    <div className="destination-page-top"><Link className="secondary-link" href="/library"><ArrowLeft size={16}/> All destinations</Link><Link className="primary-cta inline" href={editUrl}><Pencil size={16}/> Edit destination</Link></div>
    <header className="destination-page-hero"><div><span className="eyebrow">DESTINATION GUIDE · {destination.district}</span><h1>{destination.name}</h1><p>{defaultDayNote(destination)}</p></div><div className="destination-page-hero-meta"><span>{destination.tier}</span><strong>{destination.local_sightseeing.length}</strong><small>sightseeing places</small></div></header>
    <div className="destination-profile-stats"><div><span>Recommended days</span><b>{destination.min_days}–{destination.max_days}</b><small>{destination.ideal_days} ideal</small></div><div><span>Overnight</span><b>{destination.overnight_allowed ? 'Yes' : 'No'}</b><small>{destination.overnight_allowed ? `${destination.min_nights}–${destination.max_nights} nights` : 'Sightseeing stop'}</small></div><div><span>Available activities</span><b>{selectedActivities.length}</b><small>shown in Activities & Transport</small></div></div>
    <section className="destination-detail-section destination-note"><div className="drawer-section-title"><h2>About this day</h2></div><p>{destination.day_note || defaultDayNote(destination)}</p>{(selectedThings.length > 0 || selectedActivities.length > 0) && <div className="destination-selected-experiences"><span><Sparkles size={15}/> Selected experiences added to client day text</span><p>{[...new Set([...selectedThings, ...selectedActivities])].join(' · ')}</p></div>}</section>
    <section className="destination-detail-section"><div className="destination-form-section-head"><div><span className="eyebrow">SIGHTSEEING</span><h2>{destination.name === 'Srinagar' ? 'Local sightseeing places' : 'Sightseeing places'}</h2><p>These {destination.local_sightseeing.length} places are available for the route builder to allocate across the traveller’s days.</p></div><Link className="secondary-link" href={editUrl}><Pencil size={16}/> Edit places</Link></div><div className="destination-detail-sight-grid">{destination.local_sightseeing.map((sight, index) => <article className="drawer-sight-card" key={`${sight.name}-${index}`}><span className="destination-sight-number">{String(index + 1).padStart(2, '0')}</span><b>{sight.name}</b><p>{sight.description}</p></article>)}</div>{!destination.local_sightseeing.length && <p className="destination-form-empty">No sightseeing places have been added yet.</p>}</section>
    <div className="destination-detail-pair"><section className="destination-detail-section"><div className="drawer-section-title"><h2>Things to do</h2></div><p className="destination-switch-help">Tick an experience to add it to the relevant client day description.</p><div className="destination-toggle-list">{destination.things_to_do.map((item) => <label key={item} className={(destination.enabled_things_to_do || []).includes(item) ? 'destination-enabled' : 'destination-disabled'}><input type="checkbox" checked={(destination.enabled_things_to_do || []).includes(item)} disabled={saving || destinationConnection !== 'ready'} onChange={() => void toggle('enabled_things_to_do', item)}/>{item}</label>)}</div>{!destination.things_to_do.length && <p className="destination-form-empty">No experiences yet. Add them in Edit destination.</p>}</section>
      <section className="destination-detail-section"><div className="drawer-section-title"><h2>Popular activities</h2></div><p className="destination-switch-help">Tick an activity to show it in Activities & Transport. Unticked activities go to the client exclusions list.</p><div className="destination-toggle-list">{destination.activities.map((item) => <label key={item} className={(destination.enabled_activities || []).includes(item) ? 'destination-enabled' : 'destination-disabled'}><input type="checkbox" checked={(destination.enabled_activities || []).includes(item)} disabled={saving || destinationConnection !== 'ready'} onChange={() => void toggle('enabled_activities', item)}/>{item}</label>)}</div>{!destination.activities.length && <p className="destination-form-empty">No activities yet. Add them in Edit destination.</p>}</section></div>
    {error && <p className="destination-editor-error" role="alert">{error}</p>}
    {photos.length > 0 && <section className="destination-detail-section"><div className="drawer-section-title"><h2>Destination imagery</h2><span>Wikimedia Commons</span></div><div className="photo-grid">{photos.map((photo) => <img key={photo.url} src={photo.thumb || photo.url} alt={photo.title}/>)}</div></section>}
  </main></AppShell>;
}
