'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { sources } from '@/lib/data';
import type { SourceObservation } from '@/lib/source-observations';

function checkedAt(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SourcesPage() {
  const [observations, setObservations] = useState<Record<string, SourceObservation>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/source-check', { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load source history.');
      if (active) setObservations(Object.fromEntries((payload.observations as SourceObservation[]).map((item) => [item.source_id, item])));
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load source history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function check(index: number) {
    setChecking(index); setError('');
    try {
      const response = await fetch(`/api/source-check?source=${index}`, { cache: 'no-store' });
      const observation = await response.json();
      if (!response.ok) throw new Error(observation.error || 'Source check failed.');
      setObservations((current) => ({ ...current, [observation.source_id]: observation }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Source check failed.');
    } finally { setChecking(null); }
  }

  return <AppShell><main className="page"><div className="planner-heading"><div><span className="eyebrow">SOURCES & FRESHNESS</span><h1>Source connection history</h1><p>These checks record whether each source page can be reached. They do not verify road access, weather, hotel inventory or the accuracy of itinerary facts.</p></div></div>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {loading && <p className="source-loading" role="status">Loading the latest saved checks…</p>}
    <section className="source-grid">{sources.map((source, index) => { const latest = observations[source.name]; const reachable = latest && latest.status >= 200 && latest.status < 400; return <article className="source-card" key={`${source.name}-${index}`}><div className="source-top"><b>{source.name}</b><span className="source-type">{source.type}</span></div><a href={source.url} target="_blank" rel="noreferrer">{source.url} <ExternalLink size={14}/></a><p>{source.note}</p><div className="source-actions"><span className={reachable ? 'fresh' : 'source-status-warn'}>{latest ? `${reachable ? 'Page reachable' : `HTTP ${latest.status || 'error'}`} · ${checkedAt(latest.retrieved_at)}` : loading ? 'Loading check history…' : 'No saved check yet'}</span><button type="button" onClick={() => void check(index)} disabled={checking !== null}><RefreshCw size={14}/>{checking === index ? 'Checking…' : 'Check page'}</button></div>{latest && <small className="source-check-detail">{latest.detail}</small>}</article>; })}</section>
  </main></AppShell>;
}
