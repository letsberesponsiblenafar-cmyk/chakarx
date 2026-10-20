'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Save, Trash2 } from 'lucide-react';
import type { Hotel } from '@/lib/data';
import { hotelPackageCategory, type PackageHotelBand } from '@/lib/hotels';
import { usePlanner } from '@/components/PlannerProvider';
import './hotel-database.css';

type Draft = Partial<Hotel>;
type EditorField = { key: keyof Hotel; label: string; type?: string; placeholder?: string };
const packageCategories: PackageHotelBand[] = ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'];
const identityFields: EditorField[] = [{ key: 'destination', label: 'Destination' }, { key: 'name', label: 'Hotel name' }, { key: 'starRating', label: 'Star rating', type: 'number' }, { key: 'roomType', label: 'Room type', placeholder: 'e.g. Deluxe' }, { key: 'sourceCategory', label: 'Supplier category', placeholder: 'e.g. 3 Star Deluxe' }];
const rateFields: EditorField[] = [{ key: 'mapB2B', label: 'Room · MAP B2B', type: 'number' }, { key: 'extraBedB2B', label: 'Extra bed · B2B', type: 'number' }, { key: 'cnbB2B', label: 'Child, no bed · B2B', type: 'number' }];
const supplierFields: EditorField[] = [{ key: 'address', label: 'Address' }, { key: 'website', label: 'Website', type: 'url' }, { key: 'rateValidity', label: 'Rate validity', placeholder: 'e.g. 2026-10-01 to 2026-10-31' }, { key: 'availabilityStatus', label: 'Availability status' }];

export default function HotelEditor({ initialHotel }: { initialHotel?: Hotel }) {
  const router = useRouter(); const { replaceHotelDatabase } = usePlanner();
  const [hotel, setHotel] = useState<Draft>(() => initialHotel ? { ...initialHotel, normalizedCategory: hotelPackageCategory(initialHotel) || '', sourceCategory: initialHotel.sourceCategory || (packageCategories.includes(initialHotel.normalizedCategory as PackageHotelBand) || initialHotel.normalizedCategory === 'Unspecified' ? '' : initialHotel.normalizedCategory) } : { destination: 'Srinagar', name: '', normalizedCategory: 'Signature', sourceType: 'Admin entry' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');

  function update(key: keyof Hotel, value: string) { setMessage(''); setHotel(current => ({ ...current, [key]: ['starRating', 'mapB2B', 'extraBedB2B', 'cnbB2B'].includes(key) ? value === '' ? null : Number(value) : value })); }
  async function refreshPlanner() {
    const response = await fetch('/api/hotels', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.hotels)) throw new Error('The change was saved, but the hotel list could not be refreshed. Please retry.');
    replaceHotelDatabase(data.hotels);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const recordId = hotel.id || initialHotel?.id;
      const response = await fetch(recordId ? `/api/hotels/${encodeURIComponent(recordId)}` : '/api/hotels', { method: recordId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hotel), signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save hotel.');
      if (!data.hotel?.id) throw new Error('The server did not confirm the saved hotel.');
      setHotel(current => ({ ...current, id: data.hotel.id }));
      await refreshPlanner(); setMessage('Hotel saved to the shared database.');
      if (!initialHotel) router.replace(`/hotels/${encodeURIComponent(data.hotel.id)}`); else router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save hotel.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!initialHotel || !window.confirm(`Delete ${initialHotel.name}? This removes the hotel from the shared master.`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/hotels/${encodeURIComponent(initialHotel.id)}`, { method: 'DELETE' }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete hotel.'); await refreshPlanner(); router.replace('/hotels'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete hotel.'); setBusy(false); }
  }
  function field(definition: EditorField) { return <label key={definition.key}>{definition.label}<span className={definition.type === 'number' && definition.key !== 'starRating' ? 'hotel-editor-money' : 'hotel-editor-input'}>{definition.type === 'number' && definition.key !== 'starRating' && <span aria-hidden="true">₹</span>}<input type={definition.type || 'text'} min={definition.type === 'number' ? '0' : undefined} max={definition.key === 'starRating' ? '5' : undefined} step={definition.type === 'number' && definition.key !== 'starRating' ? 'any' : undefined} value={String(hotel[definition.key] ?? '')} onChange={event => update(definition.key, event.target.value)} required={definition.key === 'destination' || definition.key === 'name'} placeholder={definition.placeholder} /></span></label>; }

  return <main className="page admin-page hotel-database-page hotel-editor-page"><Link className="admin-back" href="/hotels"><ArrowLeft size={16} /> Hotel database</Link><div className="admin-heading hotel-database-heading"><div><span className="eyebrow">{initialHotel ? 'HOTEL PROFILE' : 'NEW HOTEL'}</span><h1>{initialHotel?.name || 'Add a hotel'}</h1><p>Keep your hotel details and supplier rates ready for the next client journey.</p></div><span className="hotel-editor-header-icon"><Building2 size={32} strokeWidth={1.3} /></span></div>
    {error && <div className="admin-alert" role="alert">{error}</div>}{message && <div className="admin-success" role="status">{message}</div>}
    <form className="hotel-profile-form" onSubmit={save}>
      <section className="hotel-profile-section"><div className="hotel-profile-section-heading"><span className="hotel-profile-step">01</span><div><h2>Hotel details</h2><p>The identity and category used throughout your workspace.</p></div></div><div className="hotel-package-selection"><label htmlFor="hotel-package-category">Package category<select id="hotel-package-category" aria-describedby="hotel-package-category-help" required value={hotel.normalizedCategory || ''} onChange={event => update('normalizedCategory', event.target.value)}><option value="" disabled>Choose package category</option>{packageCategories.map(value => <option key={value}>{value}</option>)}</select></label><p id="hotel-package-category-help">You choose the package category for hotel recommendations. Star rating and supplier category do not change this selection.</p></div><div className="hotel-profile-fields">{identityFields.map(field)}</div></section>
      <section className="hotel-profile-section"><div className="hotel-profile-section-heading"><span className="hotel-profile-step">02</span><div><h2>Supplier rates</h2><p>Internal B2B rates per night, used to calculate the trip cost.</p></div></div><div className="hotel-profile-fields hotel-profile-rates">{rateFields.map(field)}</div></section>
      <section className="hotel-profile-section"><div className="hotel-profile-section-heading"><span className="hotel-profile-step">03</span><div><h2>Supplier information</h2><p>Keep the rate period and property details together.</p></div></div><div className="hotel-profile-fields hotel-profile-supplier">{supplierFields.map(field)}<label className="wide">Internal notes<textarea value={hotel.notes || ''} onChange={event => update('notes', event.target.value)} rows={4} placeholder="Supplier notes for your team" /></label></div></section>
      <div className="hotel-profile-actions"><div><button className="primary-cta inline" disabled={busy}><Save size={17} />{busy ? 'Saving…' : 'Save hotel'}</button><Link className="secondary-link" href="/hotels">Back to hotels</Link></div><small>Changes update your shared hotel database.</small></div>
    </form>
    {initialHotel && <div className="hotel-profile-danger"><div><b>Delete this hotel</b><p>Remove this property from the shared hotel master.</p></div><button className="secondary-link danger" type="button" onClick={remove} disabled={busy}><Trash2 size={16} /> Delete hotel</button></div>}
  </main>;
}
