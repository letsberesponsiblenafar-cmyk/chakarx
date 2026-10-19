'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DestinationEditor from '@/components/DestinationEditor';
import { usePlanner } from '@/components/PlannerProvider';
import type { Destination } from '@/lib/data';
import { destinationFromRoute } from '@/lib/destination-route';

export default function EditDestinationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { destinationCatalog, destinationConnection, destinationConnectionError, refreshDestinations, removeDestinationFromLibrary } = usePlanner();
  const destination = destinationFromRoute(destinationCatalog, id);
  const [confirmed, setConfirmed] = useState<{ routeId: string; destination: Destination } | null>(null);
  useEffect(() => {
    if (destinationConnection === 'ready') setConfirmed(destination ? { routeId: id, destination } : null);
  }, [id, destination, destinationConnection]);
  // Wait for the first confirmed record, then retain the same editor instance
  // while a save refreshes the library so the user's draft is never discarded.
  const initial = destinationConnection === 'ready' ? destination : confirmed?.routeId === id ? confirmed.destination : undefined;
  async function saved(record: Destination) {
    if (!await refreshDestinations(true)) throw new Error('Destination saved, but the updated library could not be loaded. Retry the connection before continuing. Your draft is kept here.');
    router.push(`/library/${encodeURIComponent(record.id || record.name)}`);
  }
  async function deleted() {
    if (destination) removeDestinationFromLibrary(destination);
    await refreshDestinations();
    router.replace('/library');
  }
  return <AppShell>{initial
    ? <>
      {destinationConnection !== 'ready' && <div className="page destination-page"><div className="empty-panel" role={destinationConnection === 'error' ? 'alert' : 'status'}><h2>{destinationConnection === 'loading' ? 'Refreshing destination…' : 'Could not refresh destination'}</h2><p>{destinationConnection === 'error' ? destinationConnectionError || 'The saved destination could not be verified.' : 'Checking saved details.'} Your draft is kept below. Editing is paused until the connection is ready.</p>{destinationConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshDestinations()}>Retry connection</button>}</div></div>}
      <fieldset className="destination-edit-fields" disabled={destinationConnection !== 'ready'}><DestinationEditor key={initial.id || initial.name} initial={initial} onSaved={saved} onDeleted={deleted}/></fieldset>
    </>
    : <main className="page destination-page"><Link className="secondary-link" href="/library">← Destination library</Link><div className="empty-panel" role={destinationConnection === 'error' ? 'alert' : 'status'}><h2>{destinationConnection === 'loading' ? 'Loading destination…' : destinationConnection === 'error' ? 'Could not load destination' : 'Destination not found'}</h2><p>{destinationConnection === 'loading' ? 'Loading saved details before editing.' : destinationConnection === 'error' ? destinationConnectionError || 'The saved destination could not be verified. Retry before editing.' : 'Choose a destination from the library.'}</p>{destinationConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshDestinations()}>Retry connection</button>}</div></main>}</AppShell>;
}
