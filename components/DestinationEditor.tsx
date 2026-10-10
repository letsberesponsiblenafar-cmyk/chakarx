'use client';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Destination } from '@/lib/data';
import { defaultDayNote } from '@/lib/narrative';

type Sight = Destination['local_sightseeing'][number];
type OptionKey = 'things_to_do' | 'activities';

function newDestination(): Destination {
  return { id: crypto.randomUUID(), name: '', tier: 'Secondary', district: '', tags: [], min_days: 1, ideal_days: 1, max_days: 3,
    min_nights: 0, ideal_nights: 1, max_nights: 2, overnight_allowed: true, season: 'all', access: 'standard', source: 'Chakar destination library',
    description: '', day_note: '', highlights: [], local_sightseeing: [], things_to_do: [], activities: [], enabled_things_to_do: [], enabled_activities: [],
    photoQuery: '', sites: [], base: true, cluster: 'other' };
}

function duplicates(values: string[]) {
  const seen = new Set<string>();
  return values.some((value) => { const key = value.trim().toLowerCase(); if (!key) return false; if (seen.has(key)) return true; seen.add(key); return false; });
}

export default function DestinationEditor({ initial, onSaved }: { initial?: Destination; onSaved: (destination: Destination) => Promise<void> }) {
  const [draft, setDraft] = useState<Destination>(() => initial ? {
    ...initial, id: initial.id || initial.name, day_note: initial.day_note || defaultDayNote(initial),
    local_sightseeing: initial.local_sightseeing.map((sight) => ({ ...sight, tags: [...sight.tags] })),
    things_to_do: [...initial.things_to_do], activities: [...initial.activities],
    enabled_things_to_do: [...(initial.enabled_things_to_do || [])], enabled_activities: [...(initial.enabled_activities || [])],
  } : newDestination());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const back = initial ? `/library/${encodeURIComponent(initial.id || initial.name)}` : '/library';
  const selectedExperiences = [...new Set([...(draft.enabled_things_to_do || []), ...(draft.enabled_activities || [])].filter(Boolean))];
  const change = <K extends keyof Destination>(key: K, value: Destination[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSight = (index: number, patch: Partial<Sight>) => setDraft((current) => ({ ...current,
    local_sightseeing: current.local_sightseeing.map((sight, position) => position === index ? { ...sight, ...patch } : sight),
  }));
  const addSight = () => change('local_sightseeing', [...draft.local_sightseeing, { name: '', description: '', tags: [], season: 'all' }]);
  const removeSight = (index: number) => change('local_sightseeing', draft.local_sightseeing.filter((_, position) => position !== index));
  const enabledKey = (key: OptionKey) => key === 'things_to_do' ? 'enabled_things_to_do' : 'enabled_activities';
  const updateOption = (key: OptionKey, index: number, value: string) => setDraft((current) => {
    const previous = current[key][index];
    const options = current[key].map((item, position) => position === index ? value : item);
    const selection = current[enabledKey(key)] || [];
    return { ...current, [key]: options, [enabledKey(key)]: selection.map((item) => item === previous ? value : item) };
  });
  const addOption = (key: OptionKey) => change(key, [...draft[key], '']);
  const removeOption = (key: OptionKey, index: number) => setDraft((current) => {
    const removed = current[key][index];
    return { ...current, [key]: current[key].filter((_, position) => position !== index), [enabledKey(key)]: (current[enabledKey(key)] || []).filter((item) => item !== removed) };
  });
  const toggleOption = (key: OptionKey, value: string) => setDraft((current) => {
    const field = enabledKey(key);
    const active = current[field] || [];
    return { ...current, [field]: active.includes(value) ? active.filter((item) => item !== value) : [...active, value] };
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const local_sightseeing = draft.local_sightseeing.map((sight) => ({ ...sight, name: sight.name.trim(), description: sight.description.trim() })).filter((sight) => sight.name);
    const things_to_do = draft.things_to_do.map((item) => item.trim()).filter(Boolean);
    const activities = draft.activities.map((item) => item.trim()).filter(Boolean);
    if (duplicates(local_sightseeing.map((sight) => sight.name)) || duplicates(things_to_do) || duplicates(activities)) {
      setError('Each sightseeing place, thing to do and popular activity needs a unique name.'); return;
    }
    const destination: Destination = { ...draft, name: draft.name.trim(), district: draft.district.trim(), day_note: (draft.day_note || '').trim(),
      description: draft.description || (draft.day_note || '').trim(), photoQuery: draft.photoQuery.trim() || `${draft.name.trim()} Kashmir`,
      local_sightseeing, things_to_do, activities,
      enabled_things_to_do: (draft.enabled_things_to_do || []).map((item) => item.trim()).filter((item) => things_to_do.includes(item)),
      enabled_activities: (draft.enabled_activities || []).map((item) => item.trim()).filter((item) => activities.includes(item)) };
    setSaving(true);
    try {
      const response = await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(destination) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save destination.');
      await onSaved(destination);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save destination.'); }
    finally { setSaving(false); }
  }

  function optionSection(key: OptionKey, title: string, help: string) {
    return <section className="destination-form-section"><div className="destination-form-section-head"><div><span className="eyebrow">EXPERIENCES</span><h2>{title}</h2><p>{help}</p></div><button type="button" className="secondary-link" onClick={() => addOption(key)}><Plus size={16}/> Add</button></div>
      <div className="destination-option-list">{draft[key].map((item, index) => <div className="destination-option-row" key={index}>
        <label className="destination-option-check"><input type="checkbox" checked={Boolean(item.trim()) && (draft[enabledKey(key)] || []).includes(item)} disabled={!item.trim()} onChange={() => toggleOption(key, item)}/><span>Use in itinerary</span></label>
        <input aria-label={`${title} ${index + 1}`} value={item} onChange={(event) => updateOption(key, index, event.target.value)} placeholder={key === 'activities' ? 'Activity name' : 'Experience name'}/>
        <button type="button" className="destination-row-remove" aria-label={`Remove ${item || title}`} onClick={() => removeOption(key, index)}><Trash2 size={16}/></button>
      </div>)}</div>
      {!draft[key].length && <p className="destination-form-empty">No entries yet. Add one above.</p>}
    </section>;
  }

  return <main className="page destination-page destination-edit-page">
    <div className="destination-page-top"><Link className="secondary-link" href={back}>← Back to {initial ? 'destination' : 'library'}</Link><span className="eyebrow">KASHMIR DESTINATION LIBRARY</span></div>
    <div className="destination-page-hero"><div><span className="eyebrow">{initial ? 'EDIT DESTINATION' : 'NEW DESTINATION'}</span><h1>{initial ? `Edit ${initial.name}` : 'Add a destination'}</h1><p>Update sightseeing, client-ready day text and available experiences. Saved changes flow into future Build Trip itineraries.</p></div></div>
    <form onSubmit={save} className="destination-full-form">
      <section className="destination-form-section"><div className="destination-form-section-head"><div><span className="eyebrow">01 · OVERVIEW</span><h2>Destination details</h2></div></div>
        <div className="destination-editor-grid"><label>Name<input required value={draft.name} onChange={(event) => change('name', event.target.value)}/></label><label>District<input value={draft.district} onChange={(event) => change('district', event.target.value)}/></label><label>Category<select value={draft.tier} onChange={(event) => change('tier', event.target.value)}>{['Iconic','Established','Secondary','Offbeat','Iconic Site','Seasonal Icon','Special'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Photo search<input value={draft.photoQuery} onChange={(event) => change('photoQuery', event.target.value)} placeholder="e.g. Srinagar Kashmir"/></label></div>
        <label>About this day<textarea rows={5} value={draft.day_note || ''} onChange={(event) => change('day_note', event.target.value)} placeholder="Write client-ready destination context. The itinerary adds the transfer, selected sights and overnight stay automatically."/><small>Use general destination language here. The route adds its selected sightseeing places and available experiences to the relevant day.</small></label>
        <div className="destination-editor-preview"><span>SELECTED EXPERIENCES FOR CLIENT DAY TEXT</span><p>{selectedExperiences.length ? selectedExperiences.join(' · ') : 'Tick things to do or popular activities below to include them when the itinerary has time for them.'}</p></div>
      </section>
      <section className="destination-form-section"><div className="destination-form-section-head"><div><span className="eyebrow">02 · SIGHTSEEING</span><h2>{draft.name === 'Srinagar' ? 'Local sightseeing places' : 'Sightseeing places'}</h2><p>Edit each place independently. These are the same {draft.local_sightseeing.length} places shown on the destination page and used by the route builder.</p></div><button type="button" className="secondary-link" onClick={addSight}><Plus size={16}/> Add place</button></div>
        <div className="destination-sight-edit-grid">{draft.local_sightseeing.map((sight, index) => <div className="destination-sight-edit-card" key={index}><div className="destination-sight-edit-head"><span>PLACE {String(index + 1).padStart(2, '0')}</span><button type="button" className="destination-row-remove" aria-label={`Remove ${sight.name || 'place'}`} onClick={() => removeSight(index)}><Trash2 size={16}/></button></div><label>Place name<input value={sight.name} onChange={(event) => updateSight(index, { name: event.target.value })} placeholder="Sightseeing place"/></label><label>Description<textarea rows={3} value={sight.description} onChange={(event) => updateSight(index, { description: event.target.value })} placeholder="What the traveller will see here"/></label></div>)}</div>
        {!draft.local_sightseeing.length && <p className="destination-form-empty">No sightseeing places yet. Add the first place above.</p>}
      </section>
      <div className="destination-form-pair">{optionSection('things_to_do', 'Things to do', 'Tick the experiences to mention in About this day. Unticked items stay out of the client day text.')}{optionSection('activities', 'Popular activities', 'Only ticked activities appear on the Activities & Transport step. Unticked activities appear in the client exclusions list.')}</div>
      <details className="destination-form-section destination-advanced"><summary>Trip planning settings</summary><div className="destination-editor-grid destination-number-grid">
        {(['min_days','ideal_days','max_days','min_nights','ideal_nights','max_nights'] as const).map((key) => <label key={key}>{key.replace(/_/g, ' ')}<input type="number" min="0" max="30" value={draft[key]} onChange={(event) => change(key, Number(event.target.value))}/></label>)}
      </div><div className="destination-editor-grid"><label>Season<input value={draft.season} onChange={(event) => change('season', event.target.value)}/></label><label>Access classification<input value={draft.access} onChange={(event) => change('access', event.target.value)}/></label><label>Drive hours from Srinagar<input type="number" min="0.1" max="24" step="0.1" value={draft.srinagar_hours ?? ''} onChange={(event) => change('srinagar_hours', event.target.value ? Number(event.target.value) : undefined)}/></label><label>Distance from Srinagar (km)<input type="number" min="1" max="2000" value={draft.srinagar_km ?? ''} onChange={(event) => change('srinagar_km', event.target.value ? Number(event.target.value) : undefined)}/></label><label>Cluster<input value={draft.cluster} onChange={(event) => change('cluster', event.target.value)}/></label><label>Source<input value={draft.source} onChange={(event) => change('source', event.target.value)}/></label></div><div className="destination-editor-grid"><label className="destination-check"><input type="checkbox" checked={draft.overnight_allowed} onChange={(event) => change('overnight_allowed', event.target.checked)}/> Overnight stay allowed</label><label className="destination-check"><input type="checkbox" checked={Boolean(draft.base)} onChange={(event) => change('base', event.target.checked)}/> Include as trip base</label></div></details>
      {error && <p className="destination-editor-error" role="alert">{error}</p>}
      <footer className="destination-form-actions"><Link className="secondary-link" href={back}>Cancel</Link><button type="submit" className="primary-cta inline" disabled={saving}>{saving ? 'Saving…' : 'Save destination'}</button></footer>
    </form>
  </main>;
}
