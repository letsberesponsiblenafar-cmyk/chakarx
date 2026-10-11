'use client';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { usePlanner } from '@/components/PlannerProvider';
import type { PackageDefaults } from '@/lib/package-defaults';
import '@/app/planner/destination-refinement.css';

const clone = (value: PackageDefaults): PackageDefaults => ({ included: [...value.included], excluded: [...value.excluded] });

export default function PackageDefaultsEditor() {
  const { packageDefaults, packageDefaultsConnection, packageDefaultsError, refreshPackageDefaults, updatePackageDefaults } = usePlanner();
  const [draft, setDraft] = useState<PackageDefaults | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const ready = packageDefaultsConnection === 'ready';
  const values = draft || packageDefaults;

  function change(kind: keyof PackageDefaults, index: number, value: string) {
    setDraft((current) => current && ({ ...current, [kind]: current[kind].map((line, position) => position === index ? value : line) }));
    setError('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updatePackageDefaults({ included: draft.included.map((line) => line.trim()).filter(Boolean), excluded: draft.excluded.map((line) => line.trim()).filter(Boolean) });
      setDraft(null); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the default lists.'); }
    finally { setSaving(false); }
  }

  return <section className="library-package-defaults" aria-labelledby="package-defaults-heading">
    <header className="library-package-head"><div><span className="eyebrow">FOR EVERY ITINERARY</span><h2 id="package-defaults-heading">Default inclusions &amp; exclusions</h2><p>One shared list for all client itineraries. Hotels, meals, transport and each client’s activity choices are added from their trip.</p></div>{!draft && <button type="button" className="secondary-link" disabled={!ready} onClick={() => { setDraft(clone(packageDefaults)); setError(''); setSaved(false); }}><Pencil size={16}/> Edit defaults</button>}</header>
    {packageDefaultsConnection === 'loading' && <p className="library-package-status" role="status">Loading shared defaults…</p>}
    {packageDefaultsConnection === 'error' && <div className="destination-connection-error" role="alert"><span>Shared defaults are unavailable: {packageDefaultsError}</span><button type="button" onClick={() => void refreshPackageDefaults()}>Retry connection</button></div>}
    {(ready || draft) && <form onSubmit={save}>
      <div className="destination-package-grid">{(['included', 'excluded'] as const).map((kind) => <div className="destination-package-column" key={kind}><div className="destination-package-heading"><h3>Default {kind === 'included' ? 'inclusions' : 'exclusions'}</h3>{draft && <button type="button" className="secondary-link" disabled={saving || values[kind].length >= 80} onClick={() => setDraft((current) => current && ({ ...current, [kind]: [...current[kind], ''] }))}><Plus size={15}/> Add line</button>}</div>
        {draft ? <div className="destination-option-list">{values[kind].map((line, index) => <div className="destination-option-row destination-option-row-simple" key={index}><textarea rows={2} disabled={saving} maxLength={300} aria-label={`Default ${kind === 'included' ? 'inclusion' : 'exclusion'} ${index + 1}`} placeholder="One clear line for the client" value={line} onChange={(event) => change(kind, index, event.target.value)}/><button type="button" className="destination-row-remove" disabled={saving} aria-label={`Remove ${kind === 'included' ? 'inclusion' : 'exclusion'} ${index + 1}`} onClick={() => setDraft((current) => current && ({ ...current, [kind]: current[kind].filter((_, position) => position !== index) }))}><Trash2 size={16}/></button></div>)}</div> : <ul>{values[kind].map((line, index) => <li key={index}>{line}</li>)}</ul>}
        {!values[kind].length && <p className="destination-form-empty">No default {kind === 'included' ? 'inclusions' : 'exclusions'}. The trip’s own choices still apply.</p>}
      </div>)}</div>
      {error && <p className="destination-editor-error" role="alert">{error}</p>}
      {draft && <footer className="library-package-actions"><span>Changes apply to every itinerary when its PDF is next generated.</span><button type="button" className="secondary-link" disabled={saving} onClick={() => { setDraft(null); setError(''); }}>Cancel</button><button type="submit" className="primary-cta inline" disabled={saving || !ready}>{saving ? 'Saving…' : 'Save defaults'}</button></footer>}
    </form>}
    {saved && <p className="library-package-saved" role="status"><Check size={16}/> Shared defaults saved.</p>}
  </section>;
}
