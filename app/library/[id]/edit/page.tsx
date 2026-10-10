'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DestinationEditor from '@/components/DestinationEditor';
import { usePlanner } from '@/components/PlannerProvider';
import type { Destination } from '@/lib/data';

export default function EditDestinationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { destinationCatalog, destinationConnection, destinationConnectionError, refreshDestinations } = usePlanner();
  const destination = destinationCatalog.find((item) => item.id === id || item.name === id);
  async function saved(record: Destination) {
    await refreshDestinations();
    router.push(`/library/${encodeURIComponent(record.id || record.name)}`);
  }
  return <AppShell>{destination
    ? <DestinationEditor key={destination.id || destination.name} initial={destination} onSaved={saved}/>
    : <main className="page destination-page"><Link className="secondary-link" href="/library">← Destination library</Link><div className="empty-panel"><h2>{destinationConnection === 'loading' ? 'Loading destination…' : 'Destination not found'}</h2><p>{destinationConnection === 'error' ? destinationConnectionError : 'Choose a destination from the library.'}</p></div></main>}</AppShell>;
}
