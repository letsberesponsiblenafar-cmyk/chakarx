'use client';
import { useState } from 'react';
import type { Destination } from '@/lib/data';
import { defaultDayNote } from '@/lib/narrative';

function newDestination(): Destination {
  return { id: crypto.randomUUID(), name: '', tier: 'Secondary', district: '', tags: [], min_days: 1, ideal_days: 1, max_days: 3,
    min_nights: 0, ideal_nights: 1, max_nights: 2, overnight_allowed: true, season: 'all', access: 'standard', source: 'Chakar destination library',
    description: '', day_note: '', highlights: [], local_sightseeing: [], things_to_do: [], activities: [], enabled_things_to_do: [], enabled_activities: [],
    photoQuery: '', sites: [], base: true, cluster: 'other' };
}
const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const sightText = (destination: Destination) => destination.local_sightseeing.map((sight) => `${sight.name} | ${sight.description} | ${sight.tags.join(', ')}`).join('\n');

export default function DestinationEditor({ initial, onClose, onSaved }: { initial?: Destination; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft,setDraft] = useState<Destination>(() => initial ? { ...initial, id: initial.id || initial.name, day_note: initial.day_note || defaultDayNote(initial), enabled_things_to_do: initial.enabled_things_to_do || [], enabled_activities: initial.enabled_activities || [] } : newDestination());
  const [sights,setSights] = useState(() => sightText(draft));
  const [rawLists,setRawLists] = useState(() => ({ tags: draft.tags.join('\n'), highlights: draft.highlights.join('\n'), things_to_do: draft.things_to_do.join('\n'), activities: draft.activities.join('\n') }));
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const change = <K extends keyof Destination>(key: K, value: Destination[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggle = (key: 'enabled_things_to_do' | 'enabled_activities', value: string) => setDraft((current) => {
    const active = current[key] || [];
    return { ...current, [key]: active.includes(value) ? active.filter((item) => item !== value) : [...active,value] };
  });
  const updateOptions = (key: 'things_to_do' | 'activities', value: string) => {
    setRawLists((current) => ({ ...current, [key]: value }));
    const options = lines(value);
    setDraft((current) => ({ ...current, [key]: options, [key === 'things_to_do' ? 'enabled_things_to_do' : 'enabled_activities']: (current[key === 'things_to_do' ? 'enabled_things_to_do' : 'enabled_activities'] || []).filter((item) => options.includes(item)) }));
  };
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const local_sightseeing = lines(sights).map((line) => {
        const [name,description,tags] = line.split('|').map((item) => item.trim());
        return { name, description: description || '', tags: tags ? tags.split(',').map((item) => item.trim()).filter(Boolean) : [], season: 'all' };
      });
      const destination = { ...draft, name: draft.name.trim(), photoQuery: draft.photoQuery.trim() || `${draft.name} Kashmir`, local_sightseeing };
      const response = await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(destination) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save destination.');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save destination.'); }
    finally { setSaving(false); }
  }
  return <div className="destination-backdrop" onClick={onClose}><aside className="destination-drawer destination-editor" role="dialog" aria-modal="true" aria-label={initial ? `Edit ${initial.name}` : 'Add destination'} onClick={(event) => event.stopPropagation()}>
    <header className="destination-editor-head"><div><span className="eyebrow">CHAKAR DESTINATION LIBRARY</span><h2>{initial ? `Edit ${initial.name}` : 'Add a destination'}</h2><p>Changes here become available in Build Trip and future itinerary descriptions.</p></div><button type="button" className="close-btn" onClick={onClose} aria-label="Close destination editor">×</button></header>
    <form onSubmit={save} className="destination-editor-form">
      <div className="destination-editor-grid">
        <label>Name<input required value={draft.name} onChange={(event) => change('name',event.target.value)}/></label>
        <label>District<input value={draft.district} onChange={(event) => change('district',event.target.value)}/></label>
        <label>Category<select value={draft.tier} onChange={(event) => change('tier',event.target.value)}>{['Iconic','Established','Secondary','Offbeat','Iconic Site','Seasonal Icon','Special'].map((tier) => <option key={tier}>{tier}</option>)}</select></label>
        <label>Season<input value={draft.season} onChange={(event) => change('season',event.target.value)} placeholder="all, spring, summer…"/></label>
        <label>Access classification<input value={draft.access} onChange={(event) => change('access',event.target.value)}/></label>
        <label>Source<input value={draft.source} onChange={(event) => change('source',event.target.value)}/></label>
        <label>Drive hours from Srinagar<input type="number" min="0.1" max="24" step="0.1" value={draft.srinagar_hours ?? ''} onChange={(event) => change('srinagar_hours',event.target.value ? Number(event.target.value) : undefined)}/></label>
        <label>Distance from Srinagar (km)<input type="number" min="1" max="2000" value={draft.srinagar_km ?? ''} onChange={(event) => change('srinagar_km',event.target.value ? Number(event.target.value) : undefined)}/></label>
      </div>
      <label>Guide description<textarea rows={3} value={draft.description} onChange={(event) => change('description',event.target.value)}/></label>
      <label>About this day — client itinerary note<textarea rows={4} value={draft.day_note || ''} onChange={(event) => change('day_note',event.target.value)} placeholder="Describe the experience in client-ready language. Transfer and overnight sentences are added automatically."/><small>This note appears when this destination is selected for an itinerary day. Chakar handles access and arrangements before sending the proposal.</small></label>
      <div className="destination-editor-grid">
        <label>Tags (one per line)<textarea rows={4} value={rawLists.tags} onChange={(event) => { setRawLists((current) => ({ ...current, tags: event.target.value })); change('tags',lines(event.target.value)); }}/></label>
        <label>Highlights (one per line)<textarea rows={4} value={rawLists.highlights} onChange={(event) => { setRawLists((current) => ({ ...current, highlights: event.target.value })); change('highlights',lines(event.target.value)); }}/></label>
      </div>
      <label>Sightseeing places — one per line as Name | Description | tag, tag<textarea rows={5} value={sights} onChange={(event) => setSights(event.target.value)}/></label>
      <div className="destination-editor-grid">
        <label>Things to do (one per line)<textarea rows={5} value={rawLists.things_to_do} onChange={(event) => updateOptions('things_to_do',event.target.value)}/></label>
        <label>Popular activities (one per line)<textarea rows={5} value={rawLists.activities} onChange={(event) => updateOptions('activities',event.target.value)}/></label>
      </div>
      <div className="destination-editor-grid destination-activity-grid">
        <fieldset><legend>Include these things to do in itineraries</legend>{draft.things_to_do.map((item) => <label key={item}><input type="checkbox" checked={(draft.enabled_things_to_do || []).includes(item)} onChange={() => toggle('enabled_things_to_do',item)}/>{item}</label>)}{!draft.things_to_do.length && <small>Add options above to choose from.</small>}</fieldset>
        <fieldset><legend>Include these activities in itineraries</legend>{draft.activities.map((item) => <label key={item}><input type="checkbox" checked={(draft.enabled_activities || []).includes(item)} onChange={() => toggle('enabled_activities',item)}/>{item}</label>)}{!draft.activities.length && <small>Add options above to choose from.</small>}</fieldset>
      </div>
      <div className="destination-editor-grid destination-number-grid">
        {(['min_days','ideal_days','max_days','min_nights','ideal_nights','max_nights'] as const).map((key) => <label key={key}>{key.replace(/_/g,' ')}<input type="number" min="0" max="30" value={draft[key]} onChange={(event) => change(key,Number(event.target.value))}/></label>)}
      </div>
      <div className="destination-editor-grid"><label className="destination-check"><input type="checkbox" checked={draft.overnight_allowed} onChange={(event) => change('overnight_allowed',event.target.checked)}/> Overnight stay allowed</label><label className="destination-check"><input type="checkbox" checked={Boolean(draft.base)} onChange={(event) => change('base',event.target.checked)}/> Include as trip base</label></div>
      <div className="destination-editor-grid"><label>Cluster<input value={draft.cluster} onChange={(event) => change('cluster',event.target.value)}/></label><label>Photo search<input value={draft.photoQuery} onChange={(event) => change('photoQuery',event.target.value)}/></label></div>
      {error && <p className="destination-editor-error" role="alert">{error}</p>}
      <footer className="destination-editor-actions"><button type="button" className="secondary-link" onClick={onClose}>Cancel</button><button type="submit" className="primary-cta inline" disabled={saving}>{saving ? 'Saving…' : 'Save destination'}</button></footer>
    </form>
  </aside></div>;
}
