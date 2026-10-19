'use client';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DestinationEditor from '@/components/DestinationEditor';
import { usePlanner } from '@/components/PlannerProvider';
import type { Destination } from '@/lib/data';

export default function NewDestinationPage() {
  const router = useRouter();
  const { refreshDestinations, destinationConnection, destinationConnectionError } = usePlanner();
  async function saved(record: Destination) {
    if (!await refreshDestinations()) throw new Error('Destination saved, but the updated library could not be loaded. Retry the connection before continuing. Your draft is kept here.');
    router.push(`/library/${encodeURIComponent(record.id || record.name)}`);
  }
  return <AppShell>
    {destinationConnection !== 'ready' && <div className="page destination-page"><div className="empty-panel" role={destinationConnection === 'error' ? 'alert' : 'status'}><h2>{destinationConnection === 'loading' ? 'Loading destination library…' : 'Could not load destination library'}</h2><p>{destinationConnection === 'error' ? destinationConnectionError || 'The saved destination library could not be verified.' : 'Checking saved destinations.'} Your draft is kept below. Editing is paused until the connection is ready.</p>{destinationConnection === 'error' && <button type="button" className="secondary-link" onClick={() => void refreshDestinations()}>Retry connection</button>}</div></div>}
    <fieldset className="destination-edit-fields" disabled={destinationConnection !== 'ready'}><DestinationEditor onSaved={saved}/></fieldset>
  </AppShell>;
}
