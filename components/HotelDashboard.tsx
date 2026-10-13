'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Building2, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileUp, MapPin, Plus, Search, ShieldCheck } from 'lucide-react';
import type { Hotel } from '@/lib/data';
import { hotelPackageCategory, type PackageHotelBand } from '@/lib/hotels';
import { usePlanner } from '@/components/PlannerProvider';
import './hotel-database.css';

type ImportRow = { hotel: Hotel; action: 'create' | 'update' };
const packageCategories: PackageHotelBand[] = ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'];
const pdfRecord = `CHAKAR HOTEL RECORD\nID: hotel-001\nDestination: Srinagar\nHotel: City Grace\nCategory: Signature\nSupplier Category: 3 Star\nStars: 3\nMAP B2B: 2500\nExtra Bed B2B: 800\nCNB B2B: 600\nAddress: Dal Lake Road, Srinagar\nRoom Type: Deluxe\nWebsite: https://example.com\nRate Validity: October 2026\nAvailability Status: Rate supplied; availability to confirm\nEND HOTEL`;
const money = (value: number | null) => value === null ? '—' : `₹${value.toLocaleString('en-IN')}`;

export default function HotelDashboard({ initialHotels, configured, error: initialError }: { initialHotels: Hotel[]; configured: boolean; error: string }) {
  const [hotels, setHotels] = useState(initialHotels);
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('All');
  const [packageCategory, setPackageCategory] = useState('All');
  const [rateFilter, setRateFilter] = useState<'all' | 'ready' | 'missing'>('all');
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const [importText, setImportText] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const { replaceHotelDatabase } = usePlanner();
  const destinations = useMemo(() => ['All', ...new Set(hotels.map(hotel => hotel.destination).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)), [hotels]);
  const filtered = useMemo(() => hotels.filter(hotel => {
    const band = hotelPackageCategory(hotel);
    const hasRate = Boolean(hotel.mapB2B && hotel.mapB2B > 0);
    return (destination === 'All' || hotel.destination === destination)
      && (packageCategory === 'All' || (packageCategory === 'unassigned' ? !band : band === packageCategory))
      && (rateFilter === 'all' || (rateFilter === 'ready' ? hasRate : !hasRate))
      && `${hotel.name} ${hotel.destination} ${hotel.sourceCategory} ${band}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [hotels, destination, packageCategory, rateFilter, search]);
  const rated = hotels.filter(hotel => Boolean(hotel.mapB2B && hotel.mapB2B > 0)).length;
  const hasFilters = Boolean(search || destination !== 'All' || packageCategory !== 'All' || rateFilter !== 'all');
  useEffect(() => { setVisibleCount(24); }, [search, destination, packageCategory, rateFilter]);

  function clearFilters() { setSearch(''); setDestination('All'); setPackageCategory('All'); setRateFilter('all'); }
  async function refresh() {
    const response = await fetch('/api/hotels', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not refresh hotels.');
    setHotels(data.hotels); replaceHotelDatabase(data.hotels);
  }
  async function readPreview(response: Response, source: string) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Import failed.');
    setPreview(data.records); setMessage(`${data.creates} new and ${data.updates} existing hotels found in ${source}. Review before applying.`);
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      const form = new FormData(); form.append('file', file);
      await readPreview(await fetch('/api/hotels/import', { method: 'POST', body: form }), file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed.'); }
    finally { setBusy(false); }
  }
  async function previewPastedText() {
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try { await readPreview(await fetch('/api/hotels/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: importText }) }), 'pasted hotel text'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/hotels/import', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: preview }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save import.');
      await refresh(); setMessage(`${data.count} hotel records saved to the shared database.`); setPreview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save import.'); }
    finally { setBusy(false); }
  }
  async function downloadTemplate() {
    const { jsPDF } = await import('jspdf'); const pdf = new jsPDF();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.text('Chakar Hotel Master PDF Template', 18, 22);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text('Repeat one record block per hotel. Export the complete document as a text-based PDF.', 18, 32);
    pdf.setFont('courier', 'normal'); pdf.setFontSize(10); pdf.text(pdfRecord.split('\n'), 18, 48); pdf.save('Chakar-Hotel-Master-Template.pdf');
  }

  return <main className="page admin-page hotel-database-page">
    <div className="admin-heading hotel-database-heading"><div><span className="eyebrow">YOUR SHARED COLLECTION</span><h1>Hotel database</h1><p>Browse your hotels, manage supplier rates and choose the package category used for recommendations.</p></div><div className="admin-heading-actions"><span className="admin-security"><ShieldCheck size={16} /> Admin only</span><Link className="primary-cta inline" href="/hotels/new"><Plus size={17} /> Add hotel</Link></div></div>
    {!configured && <div className="admin-alert" role="alert">The shared database is not connected yet. Add its server credentials in Vercel to enable hotel editing and imports.</div>}
    {error && <div className="admin-alert" role="alert">{error}</div>}{message && <div className="admin-success" role="status">{message}</div>}
    <section className="hotel-database-stats" aria-label="Hotel database overview"><div><span><Building2 size={16} /> Hotels</span><b>{hotels.length}</b></div><div><span><MapPin size={16} /> Destinations</span><b>{destinations.length - 1}</b></div><div><span>With room rate</span><b>{rated}</b></div><div><span>Need room rate</span><b>{hotels.length - rated}</b></div></section>

    <details className="hotel-bulk-import"><summary><span className="hotel-import-icon"><FileUp size={20} /></span><span><b>Import hotel records</b><small>Update several hotels together, then review before saving.</small></span><span className="hotel-import-formats">PDF · Excel</span><ChevronDown className="hotel-import-chevron" size={18} /></summary>
      <div className="hotel-import-content"><p>Upload a text-based PDF or an Excel workbook (.xlsx), including your destination hotel sheets. Existing hotels are matched by ID or destination and name. Package categories already chosen in hotel profiles stay in place.</p><div className="hotel-import-buttons"><label className="primary-cta inline admin-file-upload" aria-disabled={!configured || busy}><FileUp size={17} />{busy ? 'Reading records…' : 'Upload PDF or Excel'}<input className="admin-file-upload-input" type="file" aria-label="Upload hotel PDF or Excel" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={upload} disabled={!configured || busy} /></label><a className="secondary-link" href="/templates/Chakar-Hotel-Master-Template.xlsx" download><FileSpreadsheet size={17} /> Excel template</a><button className="secondary-link" type="button" onClick={downloadTemplate}><Download size={16} /> PDF template</button></div>
        <details className="hotel-import-help"><summary>PDF record format</summary><p>Repeat this block for each hotel. Destination and hotel name are required; include ID when updating a known record. Scanned PDFs need OCR before upload.</p><pre>{pdfRecord}</pre></details>
        <details className="hotel-import-help admin-paste"><summary>Paste hotel records instead</summary><p>Paste text using the same record format to preview an update.</p><textarea aria-label="Hotel records to import" value={importText} onChange={event => setImportText(event.target.value)} rows={7} placeholder={'CHAKAR HOTEL RECORD\nDestination: Srinagar\nHotel: City Grace\n...\nEND HOTEL'} /><button className="primary-cta inline" type="button" disabled={!configured || busy || importText.trim().length < 20} onClick={previewPastedText}>Preview pasted records</button></details>
      </div>
    </details>
    {preview && <section className="admin-preview hotel-import-preview" aria-label="Hotel import preview"><div className="admin-preview-head"><div><span className="eyebrow">REVIEW IMPORT</span><h2>{preview.length} hotel records</h2><p>These changes will be saved only when you apply them.</p></div><div><button className="secondary-link" type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel</button><button className="primary-cta inline" type="button" disabled={busy} onClick={apply}>{busy ? 'Saving…' : `Apply ${preview.length} changes`}</button></div></div><div className="admin-preview-list">{preview.map(({ hotel, action }) => <div key={hotel.id}><span className={action === 'create' ? 'db-status supplied' : 'db-status'}>{action}</span><b>{hotel.name}</b><small>{hotel.destination} · {hotelPackageCategory(hotel) || 'Not assigned'} · {money(hotel.mapB2B)}</small></div>)}</div></section>}

    <section className="hotel-catalog" aria-label="Browse hotel cards"><div className="hotel-catalog-heading"><div><span className="eyebrow">EXPLORE THE COLLECTION</span><h2>Browse hotels</h2></div><span aria-live="polite"><b>{filtered.length}</b> of {hotels.length} hotels</span></div>
      <div className="hotel-catalog-toolbar"><label className="hotel-catalog-search"><Search size={19} /><input aria-label="Search hotel or category" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search hotel, destination or category" /></label><label className="hotel-catalog-filter"><span>Destination</span><select aria-label="Filter destination" value={destination} onChange={event => setDestination(event.target.value)}>{destinations.map(value => <option key={value} value={value}>{value === 'All' ? 'All destinations' : value}</option>)}</select></label><label className="hotel-catalog-filter"><span>Package category</span><select aria-label="Filter package category" value={packageCategory} onChange={event => setPackageCategory(event.target.value)}><option value="All">All categories</option>{packageCategories.map(value => <option key={value}>{value}</option>)}<option value="unassigned">Not assigned</option></select></label><label className="hotel-catalog-filter"><span>Room rate</span><select aria-label="Filter hotel rates" value={rateFilter} onChange={event => setRateFilter(event.target.value as 'all' | 'ready' | 'missing')}><option value="all">All rates</option><option value="ready">With room rate</option><option value="missing">Needs room rate</option></select></label></div>
      <div className="hotel-catalog-hint"><span>Select a hotel to open its profile and edit its details.</span>{hasFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
      <div className="hotel-database-grid">{filtered.slice(0, visibleCount).map(hotel => <Link key={hotel.id} className="hotel-database-card" href={`/hotels/${encodeURIComponent(hotel.id)}`}><div className="hotel-card-location"><span><MapPin size={14} />{hotel.destination}</span><span className="hotel-package-badge">{hotelPackageCategory(hotel) || 'Not assigned'}</span></div><div className="hotel-card-identity"><span className="hotel-property-icon"><Building2 size={23} strokeWidth={1.5} /></span><h3>{hotel.name}</h3></div><div className="hotel-property-details"><span>{hotel.sourceCategory || (hotel.starRating ? `${hotel.starRating} Star` : 'Supplier category not set')}</span>{hotel.roomType && <span>{hotel.roomType}</span>}</div><div className="hotel-card-pricing"><span>Room rate · MAP</span><strong>{hotel.mapB2B && hotel.mapB2B > 0 ? money(hotel.mapB2B) : 'Rate needed'}</strong><small>per room / night</small></div><div className="hotel-card-supplements"><div><span>Extra bed</span><b>{money(hotel.extraBedB2B)}</b></div><div><span>Child, no bed</span><b>{money(hotel.cnbB2B)}</b></div></div><div className="hotel-card-profile-link"><span>{hotel.rateValidity || 'Rate validity not set'}</span><b>Edit hotel <ChevronRight size={16} /></b></div></Link>)}</div>
      {filtered.length > 0 && <div className="hotel-catalog-more"><span aria-live="polite">Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} matching hotels</span>{visibleCount < filtered.length && <button type="button" className="secondary-link" onClick={() => setVisibleCount(current => current + 24)}>Show more hotels <ChevronDown size={16} /></button>}</div>}
      {!filtered.length && <div className="hotel-catalog-empty"><Search size={26} /><h3>{hotels.length ? 'No hotels match your filters' : 'Your hotel collection starts here'}</h3><p>{hotels.length ? 'Try another name, destination or package category.' : 'Add your first hotel or import a PDF or Excel workbook.'}</p>{hasFilters ? <button type="button" className="secondary-link" onClick={clearFilters}>Clear filters</button> : <Link className="primary-cta inline" href="/hotels/new"><Plus size={16} /> Add hotel</Link>}</div>}
    </section>
  </main>;
}
