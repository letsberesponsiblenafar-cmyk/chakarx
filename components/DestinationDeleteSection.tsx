'use client';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Destination } from '@/lib/data';

export default function DestinationDeleteSection({ destination, disabled, onBusy, onDeleted }: {
  destination: Destination; disabled: boolean; onBusy: (busy: boolean) => void; onDeleted: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirmed = confirmation.trim() === destination.name;

  function cancel() { setOpen(false); setConfirmation(''); setError(''); }
  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || disabled || deleting) return;
    setDeleting(true); onBusy(true); setError('');
    try {
      const response = await fetch(`/api/destinations/${encodeURIComponent(destination.id || destination.name)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationName: confirmation.trim() }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not delete destination. Please try again.');
      await onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete destination. Please try again.');
      setDeleting(false); onBusy(false);
    }
  }

  return <section className="destination-delete-section" aria-labelledby="destination-delete-title">
    <div className="destination-delete-heading"><div><h2 id="destination-delete-title">Delete destination</h2><p>Remove {destination.name} from the library and future trip suggestions. Existing itineraries keep their saved details.{destination.name === 'Srinagar' && ' Srinagar will still serve as the arrival, departure and overnight base.'}</p></div>
      {!open && <button type="button" className="destination-delete-reveal" disabled={disabled} onClick={() => setOpen(true)} aria-expanded={false} aria-controls="destination-delete-confirmation"><Trash2 size={15}/> Delete destination</button>}
    </div>
    {open && <form id="destination-delete-confirmation" className="destination-delete-confirmation" onSubmit={remove} aria-busy={deleting}>
      <label htmlFor="destination-delete-name">Type <strong>{destination.name}</strong> to confirm deletion</label>
      <input id="destination-delete-name" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" autoFocus spellCheck={false} disabled={disabled || deleting} aria-describedby="destination-delete-help"/>
      <small id="destination-delete-help">Use the exact destination name shown above. Unsaved edits on this page will be discarded.</small>
      {error && <p className="destination-editor-error" role="alert">{error}</p>}
      <div className="destination-delete-actions"><button type="button" className="secondary-link" disabled={deleting} onClick={cancel}>Keep destination</button><button type="submit" className="destination-delete-confirm" disabled={!confirmed || disabled || deleting}><Trash2 size={15}/>{deleting ? 'Deleting…' : `Delete ${destination.name}`}</button></div>
    </form>}
  </section>;
}
