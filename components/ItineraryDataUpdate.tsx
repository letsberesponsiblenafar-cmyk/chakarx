'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePlanner } from '@/components/PlannerProvider';
import './itinerary-data-update.css';

export default function ItineraryDataUpdate() {
  const { plan, updateItineraryToCurrentData, updatingItineraryData } = usePlanner();
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(null);
  if (plan?.referenceMode !== 'saved') return null;
  async function update() {
    setResult(null);
    try {
      await updateItineraryToCurrentData();
      setResult({ error: false, text: 'Itinerary updated with current data.' });
    } catch (error) {
      setResult({ error: true, text: error instanceof Error ? error.message : 'Could not update. Please retry.' });
    }
  }
  return <section className="itinerary-data-update" aria-label="Saved itinerary data">
    <div><span>Saved itinerary</span><p>{plan.input.name || 'This trip'} uses its saved data.</p></div>
    <button type="button" className="secondary-link" disabled={updatingItineraryData} aria-busy={updatingItineraryData} onClick={() => void update()}>
      <RefreshCw size={15} aria-hidden="true"/>{updatingItineraryData ? 'Updating…' : 'Update to current data'}
    </button>
    {result && <p className={result.error ? 'itinerary-data-result error' : 'itinerary-data-result'} role={result.error ? 'alert' : 'status'}>{result.text}</p>}
  </section>;
}
