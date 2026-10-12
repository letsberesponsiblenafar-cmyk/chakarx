'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { usePlanner } from '@/components/PlannerProvider';
import { enabledSightseeing, type Destination } from '@/lib/data';
import { activitySentence, defaultDayNote, sightseeingSentence } from '@/lib/narrative';
import '@/app/planner/destination-refinement.css';

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

  async function toggle(kind: 'enabled_sightseeing' | 'enabled_activities', item: string) {
    if (!destination || saving) return;
    const previous = destination;
    const active = kind === 'enabled_sightseeing' ? enabledSightseeing(destination) : destination.enabled_activities || [];
    const selected = active.includes(item) ? active.filter((value) => value !== item) : [...active, item];
    const next = { ...destination, id: destination.id || destination.name,
      [kind]: selected,
      ...(kind === 'enabled_sightseeing' ? { things_to_do: destination.local_sightseeing.map((sight) => sight.name), enabled_things_to_do: selected } : {}) };
    setDestination(next); setSaving(true); setError('');
    try {
      const response = await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save experience selection.');
      await refreshDestinations(true);
    } catch (cause) { setDestination(previous); setError(cause instanceof Error ? cause.message : 'Could not save experience selection.'); }
    finally { setSaving(false); }
  }

  if (!destination) return <AppShell><main className="page destination-page"><Link className="secondary-link" href="/library"><ArrowLeft size={16}/> Destination library</Link><div className="empty-panel"><h2>{destinationConnection === 'loading' ? 'Loading destination…' : 'Destination not found'}</h2><p>{destinationConnection === 'error' ? destinationConnectionError : 'Choose a destination from the library.'}</p></div></main></AppShell>;
  const editUrl = `/library/${encodeURIComponent(destination.id || destination.name)}/edit`;
  const selectedThings = enabledSightseeing(destination);
  const selectedActivities = destination.enabled_activities || [];
  return <AppShell><main className="page destination-page">
    <div className="destination-page-top"><Link className="secondary-link" href="/library"><ArrowLeft size={16}/> All destinations</Link><Link className="primary-cta inline" href={editUrl}><Pencil size={16}/> Edit destination</Link></div>
    <header className="destination-page-hero"><div><span className="eyebrow">DESTINATION GUIDE · {destination.district}</span><h1>{destination.name}</h1></div><div className="destination-page-hero-meta"><span>{destination.tier}</span><strong>{destination.local_sightseeing.length}</strong><small>things to do</small></div></header>
    <section className="destination-detail-section destination-note"><div className="drawer-section-title"><h2>About this day</h2></div><p>{destination.day_note || defaultDayNote(destination)}</p><small>Checked places supply the client itinerary sentences. Unchecked places are left out.</small></section>
    <div className="destination-detail-pair"><section className="destination-detail-section"><div className="drawer-section-title"><h2>Things to do</h2><span>{selectedThings.length} selected</span></div><p className="destination-switch-help">Choose the places to include in About This Day. The planner distributes checked places across this destination’s visit days without repeating a visit. You can edit the final wording in the itinerary.</p><div className="destination-toggle-list">{destination.local_sightseeing.map((sight) => <label key={sight.name} className={selectedThings.includes(sight.name) ? 'destination-enabled' : 'destination-disabled'}><input type="checkbox" checked={selectedThings.includes(sight.name)} disabled={saving || destinationConnection !== 'ready'} onChange={() => void toggle('enabled_sightseeing', sight.name)}/><span><b>{sight.name}</b><small>{sightseeingSentence(sight)}</small></span></label>)}</div>{!destination.local_sightseeing.length && <p className="destination-form-empty">No places yet. Add them in Edit Destination.</p>}</section>
      <section className="destination-detail-section"><div className="drawer-section-title"><h2>Popular activities</h2><span>{selectedActivities.length} available</span></div><p className="destination-switch-help">Tick activities available to offer. Their sentence enters the client day only when the activity is selected and priced for that trip.</p><div className="destination-toggle-list">{destination.activities.map((item) => <label key={item} className={selectedActivities.includes(item) ? 'destination-enabled' : 'destination-disabled'}><input type="checkbox" checked={selectedActivities.includes(item)} disabled={saving || destinationConnection !== 'ready'} onChange={() => void toggle('enabled_activities', item)}/><span><b>{item}</b><small>{destination.activity_copy?.[item] || activitySentence(item)}</small></span></label>)}</div>{!destination.activities.length && <p className="destination-form-empty">No activities yet. Add them in Edit Destination.</p>}</section></div>
    {error && <p className="destination-editor-error" role="alert">{error}</p>}
    {photos.length > 0 && <section className="destination-detail-section"><div className="drawer-section-title"><h2>Destination imagery</h2><span>Wikimedia Commons</span></div><div className="photo-grid">{photos.map((photo) => <img key={photo.url} src={photo.thumb || photo.url} alt={photo.title}/>)}</div></section>}
  </main></AppShell>;
}
