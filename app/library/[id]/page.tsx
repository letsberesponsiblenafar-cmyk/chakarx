'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { usePlanner } from '@/components/PlannerProvider';
import { enabledSightseeing, type Destination } from '@/lib/data';
import { destinationFromRoute } from '@/lib/destination-route';
import { activitySentence, destinationAbout, sightseeingSentence } from '@/lib/narrative';
import '@/app/planner/destination-refinement.css';

export default function DestinationPage() {
  const { id } = useParams<{ id: string }>();
  const { destinationCatalog, destinationConnection, destinationConnectionError, refreshDestinations } = usePlanner();
  const fromCatalog = destinationFromRoute(destinationCatalog, id);
  const [selection, setSelection] = useState<{ source: Destination; value: Destination } | null>(null);
  const destination = fromCatalog && (selection?.source === fromCatalog ? selection.value : fromCatalog);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<{ url: string; thumb: string; title: string }[]>([]);
  useEffect(() => { setError(''); }, [id]);
  useEffect(() => {
    setPhotos([]);
    if (destinationConnection !== 'ready' || !destination?.photoQuery) return;
    let current = true;
    fetch(`/api/photos?q=${encodeURIComponent(destination.photoQuery)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (current) setPhotos(Array.isArray(payload?.photos) ? payload.photos.slice(0, 6) : []); })
      .catch(() => {});
    return () => { current = false; };
  }, [destinationConnection, destination?.photoQuery]);

  async function toggle(kind: 'enabled_sightseeing' | 'enabled_activities', item: string) {
    if (!destination || !fromCatalog || destinationConnection !== 'ready' || saving) return;
    const previous = destination;
    const active = kind === 'enabled_sightseeing' ? enabledSightseeing(destination) : destination.enabled_activities || [];
    const selected = active.includes(item) ? active.filter((value) => value !== item) : [...active, item];
    const next = { ...destination, id: destination.id || destination.name,
      [kind]: selected,
      ...(kind === 'enabled_sightseeing' ? { things_to_do: destination.local_sightseeing.map((sight) => sight.name), enabled_things_to_do: selected } : {}) };
    setSelection({ source: fromCatalog, value: next }); setSaving(true); setError('');
    try {
      const response = await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save experience selection.');
      if (!await refreshDestinations(true)) throw new Error('The selection was saved, but the updated guide could not be loaded. Retry the connection to verify it.');
    } catch (cause) { setSelection({ source: fromCatalog, value: previous }); setError(cause instanceof Error ? cause.message : 'Could not save experience selection.'); }
    finally { setSaving(false); }
  }

  if (destinationConnection !== 'ready' || !destination) return <AppShell><main className="page destination-page"><Link className="secondary-link" href="/library"><ArrowLeft size={16}/> Destination library</Link><div className="empty-panel" role={destinationConnection === 'error' ? 'alert' : 'status'}><h2>{destinationConnection === 'loading' ? 'Loading destination…' : destinationConnection === 'error' ? 'Could not load destination' : 'Destination not found'}</h2><p>{destinationConnection === 'loading' ? 'Loading the saved destination guide.' : destinationConnection === 'error' ? destinationConnectionError || 'The saved guide could not be verified. Retry before making changes.' : 'Choose a destination from the library.'}</p>{destinationConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshDestinations()}>Retry connection</button>}</div></main></AppShell>;
  const editUrl = `/library/${encodeURIComponent(destination.id || destination.name)}/edit`;
  const selectedThings = enabledSightseeing(destination);
  const selectedActivities = destination.enabled_activities || [];
  return <AppShell><main className="page destination-page">
    <div className="destination-page-top"><Link className="secondary-link" href="/library"><ArrowLeft size={16}/> All destinations</Link><Link className="primary-cta inline" href={editUrl}><Pencil size={16}/> Edit destination</Link></div>
    <header className="destination-page-hero"><div><span className="eyebrow">DESTINATION GUIDE · {destination.district}</span><h1>{destination.name}</h1></div><div className="destination-page-hero-meta"><span>{destination.tier}</span><strong>{destination.local_sightseeing.length}</strong><small>things to do</small></div></header>
    <section className="destination-detail-section destination-note"><div className="drawer-section-title"><h2>About this day</h2></div><p>{destinationAbout(destination)}</p><small>This is the destination introduction. The generated itinerary adds the checked sightseeing sentences below.</small></section>
    <div className="destination-detail-pair"><section className="destination-detail-section"><div className="drawer-section-title"><h2>Things to do</h2><span>{selectedThings.length} selected</span></div><p className="destination-switch-help">Checked places appear in this list’s order in the generated itinerary, distributed across the destination’s visit days without repeating a visit. Unchecked places are left out. The introduction above stays separate.</p><div className="destination-toggle-list">{destination.local_sightseeing.map((sight) => <label key={sight.name} className={selectedThings.includes(sight.name) ? 'destination-enabled' : 'destination-disabled'}><input type="checkbox" checked={selectedThings.includes(sight.name)} disabled={saving || destinationConnection !== 'ready'} onChange={() => void toggle('enabled_sightseeing', sight.name)}/><span><b>{sight.name}</b><small>{sightseeingSentence(sight)}</small></span></label>)}</div>{!destination.local_sightseeing.length && <p className="destination-form-empty">No places yet. Add them in Edit Destination.</p>}</section>
      <section className="destination-detail-section"><div className="drawer-section-title"><h2>Popular activities</h2><span>{selectedActivities.length} available</span></div><p className="destination-switch-help">Tick activities available to offer. Their sentence enters the client day only when the activity is selected and priced for that trip.</p><div className="destination-toggle-list">{destination.activities.map((item) => <label key={item} className={selectedActivities.includes(item) ? 'destination-enabled' : 'destination-disabled'}><input type="checkbox" checked={selectedActivities.includes(item)} disabled={saving || destinationConnection !== 'ready'} onChange={() => void toggle('enabled_activities', item)}/><span><b>{item}</b><small>{destination.activity_copy?.[item] || activitySentence(item)}</small></span></label>)}</div>{!destination.activities.length && <p className="destination-form-empty">No activities yet. Add them in Edit Destination.</p>}</section></div>
    {error && <p className="destination-editor-error" role="alert">{error}</p>}
    {photos.length > 0 && <section className="destination-detail-section"><div className="drawer-section-title"><h2>Destination imagery</h2><span>Wikimedia Commons</span></div><div className="photo-grid">{photos.map((photo) => <img key={photo.url} src={photo.thumb || photo.url} alt={photo.title}/>)}</div></section>}
  </main></AppShell>;
}
