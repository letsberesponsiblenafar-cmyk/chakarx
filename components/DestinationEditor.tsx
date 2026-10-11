'use client';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Destination, VisitWindow } from '@/lib/data';
import { activitySentence, defaultDayNote, sightseeingSentence } from '@/lib/narrative';
import '@/app/planner/destination-refinement.css';

type Sight = Destination['local_sightseeing'][number];
function newDestination(): Destination {
  return { id: crypto.randomUUID(), name: '', tier: 'Secondary', district: '', tags: [], min_days: 1, ideal_days: 1, max_days: 3,
    min_nights: 0, ideal_nights: 1, max_nights: 2, overnight_allowed: true, season: 'all', access: 'standard', source: 'Chakar destination library',
    description: '', day_note: '', highlights: [], local_sightseeing: [], things_to_do: [], activities: [], activity_copy: {}, activity_timing: {}, enabled_things_to_do: [], enabled_activities: [],
    photoQuery: '', sites: [], base: true, cluster: 'other' };
}

const clock = (minutes?: number) => minutes === undefined ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
function VisitWindowFields({ value, onChange }: { value?: VisitWindow; onChange: (value: VisitWindow) => void }) {
  const edit = (field: 'start' | 'end', text: string) => {
    const [hours, minutes] = text.split(':').map(Number);
    onChange({ ...(value || { start: 0, end: 1439 }), [field]: text ? hours * 60 + minutes : field === 'start' ? 0 : 1439 });
  };
  return <div className="destination-editor-grid"><label>Earliest visit time<input type="time" value={clock(value?.start)} onChange={(event) => edit('start', event.target.value)}/></label><label>Finish visit by<input type="time" value={clock(value?.end)} onChange={(event) => edit('end', event.target.value)}/></label></div>;
}

function duplicates(values: string[]) {
  const seen = new Set<string>();
  return values.some((value) => { const key = value.trim().toLowerCase(); if (!key) return false; if (seen.has(key)) return true; seen.add(key); return false; });
}

export default function DestinationEditor({ initial, onSaved }: { initial?: Destination; onSaved: (destination: Destination) => Promise<void> }) {
  const [draft, setDraft] = useState<Destination>(() => initial ? {
    ...initial, id: initial.id || initial.name, day_note: initial.day_note || defaultDayNote(initial),
    local_sightseeing: initial.local_sightseeing.map((sight) => ({ ...sight, tags: [...sight.tags] })),
    things_to_do: [...initial.things_to_do], activities: [...initial.activities], activity_copy: { ...(initial.activity_copy || {}) }, activity_timing: { ...(initial.activity_timing || {}) },
    enabled_sightseeing: initial.enabled_sightseeing === undefined ? undefined : [...initial.enabled_sightseeing],
    enabled_things_to_do: [...(initial.enabled_things_to_do || [])], enabled_activities: [...(initial.enabled_activities || [])],
  } : newDestination());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const back = initial ? `/library/${encodeURIComponent(initial.id || initial.name)}` : '/library';
  const change = <K extends keyof Destination>(key: K, value: Destination[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSight = (index: number, patch: Partial<Sight>) => setDraft((current) => {
    const previous = current.local_sightseeing[index]?.name;
    return { ...current,
      local_sightseeing: current.local_sightseeing.map((sight, position) => position === index ? { ...sight, ...patch } : sight),
      activity_timing: previous && patch.name !== undefined ? Object.fromEntries(Object.entries(current.activity_timing || {}).map(([name, timing]) => [name, { ...timing, sight_names: timing.sight_names?.map((sightName) => sightName === previous ? patch.name! : sightName) }])) : current.activity_timing,
      enabled_sightseeing: previous && patch.name !== undefined && current.enabled_sightseeing
        ? current.enabled_sightseeing.map((name) => name === previous ? patch.name! : name) : current.enabled_sightseeing,
    };
  });
  const addSight = () => change('local_sightseeing', [...draft.local_sightseeing, { name: '', description: '', tags: [], season: 'all' }]);
  const removeSight = (index: number) => setDraft((current) => ({ ...current,
    local_sightseeing: current.local_sightseeing.filter((_, position) => position !== index),
    activity_timing: Object.fromEntries(Object.entries(current.activity_timing || {}).map(([name, timing]) => [name, { ...timing, sight_names: timing.sight_names?.filter((sightName) => sightName !== current.local_sightseeing[index]?.name) }])),
    enabled_sightseeing: current.enabled_sightseeing?.filter((name) => name !== current.local_sightseeing[index]?.name),
  }));
  const updateActivity = (index: number, value: string) => setDraft((current) => {
    const previous = current.activities[index];
    const copy = { ...(current.activity_copy || {}) };
    const timing = { ...(current.activity_timing || {}) };
    if (value !== previous) { copy[value] = copy[previous] || ''; delete copy[previous]; }
    if (value !== previous) { if (timing[previous]) timing[value] = timing[previous]; delete timing[previous]; }
    return { ...current,
      activities: current.activities.map((item, position) => position === index ? value : item),
      enabled_activities: (current.enabled_activities || []).map((item) => item === previous ? value : item),
      local_sightseeing: current.local_sightseeing.map((sight) => sight.requires_activity === previous ? { ...sight, requires_activity: value } : sight),
      activity_copy: copy, activity_timing: timing,
    };
  });
  const addActivity = () => change('activities', [...draft.activities, '']);
  const removeActivity = (index: number) => setDraft((current) => {
    const removed = current.activities[index];
    const copy = { ...(current.activity_copy || {}) }; delete copy[removed];
    const timing = { ...(current.activity_timing || {}) }; delete timing[removed];
    return { ...current, activities: current.activities.filter((_, position) => position !== index),
      local_sightseeing: current.local_sightseeing.map((sight) => sight.requires_activity === removed ? { ...sight, requires_activity: '' } : sight),
      enabled_activities: (current.enabled_activities || []).filter((item) => item !== removed), activity_copy: copy, activity_timing: timing };
  });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const local_sightseeing = draft.local_sightseeing.map((sight) => ({ ...sight, name: sight.name.trim(), description: sight.description.trim(), client_sentence: (sight.client_sentence ?? sightseeingSentence(sight)).trim(), cluster: sight.cluster?.trim() || undefined, requires_activity: sight.requires_activity === undefined ? undefined : sight.requires_activity.trim() })).filter((sight) => sight.name);
    const activityEntries = draft.activities.map((raw) => ({ raw, name: raw.trim() })).filter((entry) => entry.name);
    const activities = activityEntries.map((entry) => entry.name);
    const things_to_do = local_sightseeing.map((sight) => sight.name);
    if (duplicates(things_to_do) || duplicates(activities)) {
      setError('Each sightseeing place and popular activity needs a unique name.'); return;
    }
    const enabled_sightseeing = draft.enabled_sightseeing === undefined ? undefined : draft.enabled_sightseeing.map((name) => name.trim()).filter((name) => things_to_do.includes(name));
    const activity_copy = Object.fromEntries(activityEntries.map(({ raw, name }) => [name, (draft.activity_copy?.[raw] || activitySentence(name)).trim()]));
    const activity_timing = Object.fromEntries(activityEntries.filter(({ raw }) => draft.activity_timing?.[raw]).map(({ raw, name }) => [name, { ...draft.activity_timing![raw], sight_names: draft.activity_timing![raw].sight_names?.map((sightName) => sightName.trim()).filter((sightName) => things_to_do.includes(sightName)) }]));
    const destination: Destination = { ...draft, name: draft.name.trim(), district: draft.district.trim(), day_note: (draft.day_note || '').trim(),
      description: draft.description || (draft.day_note || '').trim(), photoQuery: draft.photoQuery.trim() || `${draft.name.trim()} Kashmir`,
      local_sightseeing, things_to_do, activities, activity_copy, activity_timing, enabled_sightseeing,
      enabled_things_to_do: enabled_sightseeing ?? things_to_do,
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

  return <main className="page destination-page destination-edit-page">
    <div className="destination-page-top"><Link className="secondary-link" href={back}>← Back to {initial ? 'destination' : 'library'}</Link><span className="eyebrow">KASHMIR DESTINATION LIBRARY</span></div>
    <div className="destination-page-hero"><div><span className="eyebrow">{initial ? 'EDIT DESTINATION' : 'NEW DESTINATION'}</span><h1>{initial ? `Edit ${initial.name}` : 'Add a destination'}</h1><p>Write the destination introduction, one client sentence for each sightseeing place, and the popular activities. Things to Do appears automatically on the destination page.</p></div></div>
    <form onSubmit={save} className="destination-full-form">
      <section className="destination-form-section"><div className="destination-form-section-head"><div><span className="eyebrow">01 · OVERVIEW</span><h2>Destination details</h2></div></div>
        <div className="destination-editor-grid"><label>Name<input required value={draft.name} onChange={(event) => change('name', event.target.value)}/></label><label>District<input value={draft.district} onChange={(event) => change('district', event.target.value)}/></label><label>Category<select value={draft.tier} onChange={(event) => change('tier', event.target.value)}>{['Iconic','Established','Secondary','Offbeat','Iconic Site','Seasonal Icon','Special'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Photo search<input value={draft.photoQuery} onChange={(event) => change('photoQuery', event.target.value)} placeholder="e.g. Srinagar Kashmir"/></label></div>
        <label>About this day<textarea rows={5} value={draft.day_note || ''} onChange={(event) => change('day_note', event.target.value)} placeholder="Write a short destination introduction. Travel, selected sights and overnight wording are added for the actual day."/><small>Keep this introduction general. The route distributes selected sightseeing places across the available days.</small></label>
      </section>
      <section className="destination-form-section"><div className="destination-form-section-head"><div><span className="eyebrow">02 · SIGHTSEEING</span><h2>{draft.name === 'Srinagar' ? 'Local sightseeing places' : 'Sightseeing places'}</h2><p>Edit each place independently. These are the same {draft.local_sightseeing.length} places shown on the destination page and used by the route builder.</p></div><button type="button" className="secondary-link" onClick={addSight}><Plus size={16}/> Add place</button></div>
        <div className="destination-sight-edit-grid">{draft.local_sightseeing.map((sight, index) => <div className="destination-sight-edit-card" key={index}><div className="destination-sight-edit-head"><span>PLACE {String(index + 1).padStart(2, '0')}</span><button type="button" className="destination-row-remove" aria-label={`Remove ${sight.name || 'place'}`} onClick={() => removeSight(index)}><Trash2 size={16}/></button></div><label>Place name<input value={sight.name} onChange={(event) => updateSight(index, { name: event.target.value })} placeholder="Sightseeing place"/></label><label>Planned itinerary sentence<textarea rows={3} value={sight.client_sentence ?? (sight.name ? sightseeingSentence(sight) : '')} onChange={(event) => updateSight(index, { client_sentence: event.target.value })} placeholder="One complete sentence about this stop"/><small>This sentence is added to the client itinerary when this place is scheduled.</small></label>
          <details className="destination-place-timing"><summary>Advanced timing</summary><div className="destination-editor-grid"><label>Visit duration (minutes)<input type="number" min="5" max="1440" step="1" value={sight.visit_minutes ?? ''} onChange={(event) => updateSight(index, { visit_minutes: event.target.value ? Number(event.target.value) : undefined })} placeholder="e.g. 60"/></label><label>Extra local travel (minutes)<input type="number" min="0" max="720" step="1" value={sight.transfer_minutes ?? ''} onChange={(event) => updateSight(index, { transfer_minutes: event.target.value ? Number(event.target.value) : undefined })} placeholder="e.g. 30"/></label><label>Nearby group<input value={sight.cluster || ''} onChange={(event) => updateSight(index, { cluster: event.target.value || undefined })} placeholder="e.g. Pahalgam town"/></label><label>Required popular activity<select value={sight.requires_activity || ''} onChange={(event) => updateSight(index, { requires_activity: event.target.value })}><option value="">No activity required</option>{draft.activities.filter(Boolean).map((activity) => <option key={activity}>{activity}</option>)}</select></label></div><label className="destination-place-check"><input type="checkbox" checked={Boolean(sight.arrival_suitable)} onChange={(event) => updateSight(index, { arrival_suitable: event.target.checked })}/> Suitable for an arrival or transfer day</label><VisitWindowFields value={sight.time_window} onChange={(time_window) => updateSight(index, { time_window })}/><p>Nearby groups help the planner keep stops together. Add an activity requirement only when this visit depends on that activity being included.</p></details>
        </div>)}</div>
        {!draft.local_sightseeing.length && <p className="destination-form-empty">No sightseeing places yet. Add the first place above.</p>}
      </section>
      <section className="destination-form-section"><div className="destination-form-section-head"><div><span className="eyebrow">EXPERIENCES</span><h2>Popular activities</h2><p>Write one client-ready sentence for each activity. Choose what is available on the destination page; include and price it for each client in Activities &amp; Transport.</p></div><button type="button" className="secondary-link" onClick={addActivity}><Plus size={16}/> Add</button></div>
        <div className="destination-option-list">{draft.activities.map((item, index) => <div className="destination-option-row destination-option-row-simple" key={index}>
          <input aria-label={`Popular activities ${index + 1}`} value={item} onChange={(event) => updateActivity(index, event.target.value)} placeholder="Activity name"/>
          <button type="button" className="destination-row-remove" aria-label={`Remove ${item || 'activity'}`} onClick={() => removeActivity(index)}><Trash2 size={16}/></button>
          <label className="destination-option-copy">Planned itinerary sentence<input aria-label={`${item || 'Activity'} client sentence`} value={draft.activity_copy?.[item] ?? activitySentence(item)} onChange={(event) => setDraft((current) => ({ ...current, activity_copy: { ...(current.activity_copy || {}), [item]: event.target.value } }))} placeholder="One complete sentence for the client itinerary"/></label>
          <label className="destination-activity-duration">Activity duration (minutes)<input type="number" min="1" max="1440" step="1" value={draft.activity_timing?.[item]?.duration_minutes ?? ''} onChange={(event) => setDraft((current) => ({ ...current, activity_timing: { ...(current.activity_timing || {}), [item]: { ...(current.activity_timing?.[item] || {}), duration_minutes: event.target.value ? Number(event.target.value) : undefined } } }))} placeholder="e.g. 90"/><small>Reserved within the day’s available time when this activity is included.</small></label><details className="destination-place-timing"><summary>Visit time window</summary><VisitWindowFields value={draft.activity_timing?.[item]?.time_window} onChange={(time_window) => setDraft((current) => ({ ...current, activity_timing: { ...current.activity_timing, [item]: { ...current.activity_timing?.[item], time_window } } }))}/></details>
        </div>)}</div>
        {!draft.activities.length && <p className="destination-form-empty">No activities yet. Add one above.</p>}
      </section>
      <details className="destination-form-section destination-advanced"><summary>Trip planning settings</summary><div className="destination-editor-grid destination-number-grid">
        {(['min_days','ideal_days','max_days','min_nights','ideal_nights','max_nights'] as const).map((key) => <label key={key}>{key.replace(/_/g, ' ')}<input type="number" min="0" max="30" value={draft[key]} onChange={(event) => change(key, Number(event.target.value))}/></label>)}
      </div><div className="destination-editor-grid"><label>Season<input value={draft.season} onChange={(event) => change('season', event.target.value)}/></label><label>Access classification<input value={draft.access} onChange={(event) => change('access', event.target.value)}/></label><label>Drive hours from Srinagar<input type="number" min="0" max="24" step="0.05" value={draft.srinagar_hours ?? ''} onChange={(event) => change('srinagar_hours', event.target.value ? Number(event.target.value) : undefined)}/></label><label>Distance from Srinagar (km)<input type="number" min="0" max="2000" value={draft.srinagar_km ?? ''} onChange={(event) => change('srinagar_km', event.target.value ? Number(event.target.value) : undefined)}/></label><label>Cluster<input value={draft.cluster} onChange={(event) => change('cluster', event.target.value)}/></label><label>Source<input value={draft.source} onChange={(event) => change('source', event.target.value)}/></label></div><div className="destination-editor-grid"><label className="destination-check"><input type="checkbox" checked={draft.overnight_allowed} onChange={(event) => change('overnight_allowed', event.target.checked)}/> Overnight stay allowed</label><label className="destination-check"><input type="checkbox" checked={Boolean(draft.base)} onChange={(event) => change('base', event.target.checked)}/> Include as trip base</label></div>
        {draft.hub_route && <div className="destination-route-research"><b>Route reference · {draft.hub_route.reference_point || 'Srinagar city'}</b><p>{draft.hub_route.km} km · {draft.hub_route.hours}{draft.hub_route.hours_max && draft.hub_route.hours_max !== draft.hub_route.hours ? `–${draft.hub_route.hours_max}` : ''} hours by road{draft.hub_route.road_endpoint ? ` to ${draft.hub_route.road_endpoint}` : ''}.{draft.hub_route.trail_hours ? ` Allow a further ${draft.hub_route.trail_hours} hours on foot.` : ''}</p>{draft.hub_route.note && <p>{draft.hub_route.note}</p>}<p>{draft.hub_route.basis === 'published' ? 'Published route information' : 'Planning estimate'}{draft.hub_route.reviewed_at ? ` · Reviewed ${draft.hub_route.reviewed_at}` : ''}. The drive hours and distance above are the values used by the planner.</p><div>{(draft.hub_route.source_urls || []).filter((url) => /^https?:\/\//i.test(url)).map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>Route source {index + 1} ↗</a>)}</div></div>}
      </details>
      {error && <p className="destination-editor-error" role="alert">{error}</p>}
      <footer className="destination-form-actions"><Link className="secondary-link" href={back}>Cancel</Link><button type="submit" className="primary-cta inline" disabled={saving}>{saving ? 'Saving…' : 'Save destination'}</button></footer>
    </form>
  </main>;
}
