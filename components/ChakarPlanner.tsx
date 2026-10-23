'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, Clock3, Hotel, MapPin, Minus, Palette, Plus, Users } from 'lucide-react';
import { usePlanner } from '@/components/PlannerProvider';
import PdfThemePicker from '@/components/PdfThemePicker';
import { resolvePdfTheme } from '@/lib/pdf-themes';
import { hotelCategories, mealOptions } from '@/lib/data';
import { ROUTE_VERSION } from '@/lib/itinerary';
import { calculateCosts } from '@/lib/costing';
import { departureForNights, tripDuration } from '@/lib/trip-dates';
import { planInputsNeedRefresh } from '@/lib/quote-readiness';
import { packageCategories } from '@/lib/package-quotes';
import './build-trip.css';

function datePlus(n: number) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function fmtDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function money(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }

function TravellerCount({ id, label, note, value, minimum, maximum, onChange }: {
  id: string; label: string; note: string; value: string; minimum: number; maximum?: number; onChange: (value: string) => void;
}) {
  const number = Number(value);
  const current = Number.isInteger(number) && number >= minimum ? number : minimum;
  return <div className="trip-count-field">
    <div><label htmlFor={id}>{label}</label><span>{note}</span></div>
    <div className="trip-counter">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={current <= minimum} onClick={() => onChange(String(current - 1))}><Minus size={16}/></button>
      <input id={id} aria-label={label} type="number" inputMode="numeric" min={minimum} max={maximum} step="1" value={value} onChange={event => onChange(event.target.value)}/>
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={maximum !== undefined && current >= maximum} onClick={() => onChange(String(current + 1))}><Plus size={16}/></button>
    </div>
  </div>;
}

export default function ChakarPlanner() {
  const router = useRouter();
  const { input, plan, routeVersion, setInputField, setYoungAges, generate, hotelSelections, costModel } = usePlanner();
  const [busy, setBusy] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [adultsText, setAdultsText] = useState(String(input.adults));
  const [childrenText, setChildrenText] = useState(String(input.youngAges.length));
  const [budgetText, setBudgetText] = useState(String(input.budget));
  const [ageText, setAgeText] = useState<string[]>(input.youngAges.map(String));
  const [durationDaysText, setDurationDaysText] = useState('');
  const [durationNightsText, setDurationNightsText] = useState('');
  const [showTimes, setShowTimes] = useState(Boolean(input.arrivalTime || input.departureTime));
  const [summaryOpen, setSummaryOpen] = useState(true);
  useEffect(() => setAdultsText(String(input.adults)), [input.adults]);
  useEffect(() => setChildrenText(String(input.youngAges.length)), [input.youngAges.length]);
  useEffect(() => setBudgetText(String(input.budget)), [input.budget]);
  useEffect(() => setAgeText(input.youngAges.map(String)), [input.youngAges]);
  useEffect(() => { if (input.arrivalTime || input.departureTime) setShowTimes(true); }, [input.arrivalTime, input.departureTime]);
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1180px)');
    const update = () => setSummaryOpen(!compact.matches);
    update(); compact.addEventListener('change', update);
    return () => compact.removeEventListener('change', update);
  }, []);

  const arrivals = input.arrival || datePlus(7), departures = input.departure || datePlus(14);
  const duration = tripDuration(arrivals, departures);
  useEffect(() => { setDurationDaysText(duration ? String(duration.days) : ''); setDurationNightsText(duration ? String(duration.nights) : ''); }, [arrivals, departures]);
  const selectedPackages = packageCategories(input);
  const draftNeedsRefresh = Boolean(plan && planInputsNeedRefresh(plan, input));
  const adultCount = Number(adultsText);
  const people = (Number.isInteger(adultCount) && adultCount >= 1 ? adultCount : input.adults) + (childrenText.trim() === '' ? 0 : input.youngAges.length);

  function togglePackage(category: string) {
    const selected = selectedPackages.includes(category);
    if (selected && selectedPackages.length === 1) return;
    setInputField('packagePreferences', selected ? selectedPackages.filter(item => item !== category) : [...selectedPackages, category]);
  }
  function changeArrival(value: string) {
    setInputField('arrival', value);
    const adjusted = value ? departureForNights(value, duration?.nights || 7) : null;
    if (adjusted) setInputField('departure', adjusted);
  }
  function commitDuration(unit: 'days' | 'nights') {
    const raw = unit === 'days' ? durationDaysText : durationNightsText;
    const number = Number(raw), nights = unit === 'days' ? number - 1 : number;
    const adjusted = raw.trim() !== '' ? departureForNights(arrivals, nights) : null;
    if (!adjusted) {
      setQuickError('Enter 2–31 days or 1–30 nights.');
      setDurationDaysText(duration ? String(duration.days) : ''); setDurationNightsText(duration ? String(duration.nights) : '');
      return;
    }
    setQuickError(''); setInputField('departure', adjusted);
  }
  function changeAdults(raw: string) {
    setAdultsText(raw);
    if (raw !== '' && Number.isInteger(Number(raw)) && Number(raw) >= 1) setInputField('adults', Number(raw));
  }
  function changeChildren(raw: string) {
    setChildrenText(raw);
    if (raw === '' || !Number.isInteger(Number(raw)) || Number(raw) < 0) return;
    const count = Math.min(30, Number(raw));
    if (count !== Number(raw)) setChildrenText(String(count));
    const ages = [...input.youngAges];
    while (ages.length < count) ages.push(5);
    while (ages.length > count) ages.pop();
    setYoungAges(ages);
  }
  function setChildAge(index: number, value: number) {
    if (value > 14) { setInputField('adults', input.adults + 1); setYoungAges(input.youngAges.filter((_, i) => i !== index)); return; }
    const ages = [...input.youngAges]; ages[index] = Math.max(0, Math.min(14, value)); setYoungAges(ages);
  }
  function submit() {
    setQuickError('');
    try {
      if (!adultsText.trim() || !Number.isInteger(Number(adultsText)) || Number(adultsText) < 1) throw new Error('Enter a whole number of adults, at least 1.');
      if (childrenText.trim() && (!Number.isInteger(Number(childrenText)) || Number(childrenText) < 0)) throw new Error('Enter a valid number of children.');
      if (childrenText.trim() !== '' && input.youngAges.some((_, i) => ageText[i] === '' || !Number.isInteger(Number(ageText[i])))) throw new Error('Enter an age for every child.');
      setBusy(true);
      generate({ ...input, adults: Number(adultsText), youngAges: childrenText.trim() === '' ? [] : input.youngAges,
        budget: budgetText.trim() === '' ? 0 : Number(budgetText), arrival: input.arrival || arrivals, departure: input.departure || departures });
      router.push('/planner/destinations');
    } catch (error) { setQuickError(error instanceof Error ? error.message : 'Please check the trip details.'); }
    finally { setBusy(false); }
  }

  return <main className="page trip-builder">
    <header className="trip-page-heading"><h1>Build your trip<span>.</span></h1><span className="trip-heading-meta"><MapPin size={15}/> Kashmir</span></header>
    <div className="trip-layout">
      <form className="trip-form" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
        <section className="trip-panel" aria-labelledby="trip-journey-title">
          <div className="trip-panel-heading"><span>01</span><h2 id="trip-journey-title">Journey</h2><CalendarDays size={19} aria-hidden="true"/></div>
          <div className="trip-field-grid">
            <label className="trip-field" htmlFor="trip-name"><span>Traveller’s name</span><input id="trip-name" autoComplete="off" value={input.name} onChange={event => setInputField('name', event.target.value)} placeholder="Traveller or group name"/></label>
            <label className="trip-field" htmlFor="trip-pickup"><span>Pick-up point</span><select id="trip-pickup" value={input.pickup === 'Srinagar' ? 'Srinagar' : input.pickup === 'Jammu' ? 'Jammu' : 'Other'} onChange={event => setInputField('pickup', event.target.value === 'Other' ? '' : event.target.value)}><option>Srinagar</option><option>Jammu</option><option>Other</option></select></label>
            {!['Srinagar', 'Jammu'].includes(input.pickup) && <label className="trip-field trip-full-field" htmlFor="trip-custom-pickup"><span>Custom pick-up point</span><input id="trip-custom-pickup" value={input.pickup} onChange={event => setInputField('pickup', event.target.value)} placeholder="Enter location"/></label>}
            <label className="trip-field" htmlFor="trip-arrival"><span>Arrival</span><input id="trip-arrival" aria-label="Arrival date" type="date" value={arrivals} onChange={event => changeArrival(event.target.value)}/></label>
            <label className="trip-field" htmlFor="trip-departure"><span>Departure</span><input id="trip-departure" aria-label="Departure date" type="date" value={departures} onChange={event => setInputField('departure', event.target.value)}/></label>
          </div>
          <div className="trip-duration-row"><span>Trip length</span><div className="trip-duration-inputs"><label><input aria-label="Trip days" type="number" min="2" max="31" value={durationDaysText} onChange={event => setDurationDaysText(event.target.value)} onBlur={() => commitDuration('days')} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}/><span>days</span></label><span>/</span><label><input aria-label="Trip nights" type="number" min="1" max="30" value={durationNightsText} onChange={event => setDurationNightsText(event.target.value)} onBlur={() => commitDuration('nights')} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}/><span>nights</span></label></div></div>
          <button type="button" className="trip-times-toggle" aria-expanded={showTimes} aria-controls="trip-times" onClick={() => setShowTimes(!showTimes)}><Clock3 size={15}/>{showTimes ? 'Arrival & departure times' : 'Add arrival & departure times'}<span>Optional</span><ChevronDown size={15} className={showTimes ? 'is-open' : ''}/></button>
          {showTimes && <div className="trip-field-grid trip-times" id="trip-times"><label className="trip-field" htmlFor="trip-arrival-time"><span>Arrival time</span><input id="trip-arrival-time" type="time" value={input.arrivalTime || ''} onChange={event => setInputField('arrivalTime', event.target.value)}/></label><label className="trip-field" htmlFor="trip-departure-time"><span>Departure time</span><input id="trip-departure-time" type="time" value={input.departureTime || ''} onChange={event => setInputField('departureTime', event.target.value)}/></label></div>}
        </section>

        <section className="trip-panel" aria-labelledby="trip-travellers-title">
          <div className="trip-panel-heading"><span>02</span><h2 id="trip-travellers-title">Travellers</h2><Users size={19} aria-hidden="true"/></div>
          <div className="trip-field-grid trip-traveller-grid"><TravellerCount id="trip-adults" label="Adults" note="Ages 15+" value={adultsText} minimum={1} onChange={changeAdults}/><TravellerCount id="trip-children" label="Children" note="Ages 0–14" value={childrenText} minimum={0} maximum={30} onChange={changeChildren}/></div>
          {childrenText.trim() !== '' && input.youngAges.length > 0 && <div className="trip-child-ages"><div className="trip-age-heading"><span>Children’s ages</span><small>Age 15+ counts as an adult.</small></div><div>{input.youngAges.map((age, index) => <label key={index}>Child {index + 1}<input aria-label={`Child ${index + 1} age`} type="number" inputMode="numeric" min="0" max="99" step="1" value={ageText[index] ?? String(age)} onChange={event => { const raw = event.target.value; setAgeText(values => values.map((value, i) => i === index ? raw : value)); if (raw !== '' && Number.isInteger(Number(raw)) && Number(raw) >= 0) setChildAge(index, Number(raw)); }}/></label>)}</div></div>}
        </section>

        <section className="trip-panel" aria-labelledby="trip-preferences-title">
          <div className="trip-panel-heading"><span>03</span><h2 id="trip-preferences-title">Preferences</h2><Hotel size={19} aria-hidden="true"/></div>
          <div className="trip-choice-heading"><span>Package preferences</span><small>Select one or compare several</small></div>
          <div className="trip-package-options" role="group" aria-label="Package preferences">{hotelCategories.map(category => <button type="button" key={category} aria-pressed={selectedPackages.includes(category)} onClick={() => togglePackage(category)}><span>{category}</span><span className="trip-selection-mark" aria-hidden="true">{selectedPackages.includes(category) && <Check size={14}/>}</span></button>)}</div>
          <div className="trip-choice-heading"><span>Meal plan</span></div><div className="trip-segmented" role="group" aria-label="Meal plan">{mealOptions.map(option => <button type="button" key={option} aria-pressed={input.mealPlan === option} onClick={() => setInputField('mealPlan', option)}>{option}</button>)}</div>
          <div className="trip-choice-heading"><span>Hotels per destination</span></div><div className="trip-segmented" role="group" aria-label="Hotel options per destination"><button type="button" aria-pressed={input.hotelOptionMode !== 'multiple'} onClick={() => setInputField('hotelOptionMode', 'single')}>One hotel</button><button type="button" aria-pressed={input.hotelOptionMode === 'multiple'} onClick={() => setInputField('hotelOptionMode', 'multiple')}>Multiple options</button></div>
          {input.hotelOptionMode === 'multiple' && <small className="trip-field-hint">Up to 3 hotels. Costing uses the highest selected stay cost.</small>}
          <label className="trip-field trip-budget" htmlFor="trip-budget"><span>Budget per person <small>Optional</small></span><div><span aria-hidden="true">₹</span><input id="trip-budget" aria-label="Budget per person" type="number" inputMode="decimal" min="0" step="1000" value={budgetText} onChange={event => { const raw = event.target.value; setBudgetText(raw); if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0) setInputField('budget', Number(raw)); }} placeholder="Enter amount"/></div></label>
        </section>
        <section className="trip-panel" aria-labelledby="trip-pdf-theme-title">
          <div className="trip-panel-heading"><span>04</span><h2 id="trip-pdf-theme-title">PDF theme</h2><Palette size={19} aria-hidden="true"/></div>
          <PdfThemePicker value={input.pdfTheme} onChange={theme => setInputField('pdfTheme', theme)}/>
          <Link className="trip-theme-catalog-link" href="/pdf-designs">View PDF designs<ArrowRight size={13} aria-hidden="true"/></Link>
        </section>
        {quickError && <div className="trip-form-error" role="alert">{quickError}</div>}
        <footer className="trip-form-footer"><span>{duration ? `${duration.days} days · ${duration.nights} nights` : 'Set your travel dates'}<small>{people} traveller{people !== 1 ? 's' : ''} · {selectedPackages.length} package{selectedPackages.length !== 1 ? 's' : ''}</small></span><button type="submit" className="trip-continue" disabled={busy}>{busy ? 'Building…' : 'Next: Destinations'}<ArrowRight size={18}/></button></footer>
      </form>

      <aside className="trip-summary">
        <details open={summaryOpen} onToggle={event => setSummaryOpen(event.currentTarget.open)}>
          <summary><span>Trip summary</span><span>{duration ? `${duration.days} days / ${duration.nights} nights` : 'Your trip'}<ChevronDown size={17}/></span></summary>
          <div className="trip-summary-content">
            <div className="trip-summary-photo"><img src="/chakar-cover-photo.jpg" alt="Mountain view from a balcony in Kashmir"/><div><span>CHAKAR EXPERIENCE</span><strong>Kashmir</strong></div></div>
            <div className="trip-summary-body"><h2>{input.name.trim() || 'Your Kashmir trip'}</h2><dl><div><dt><CalendarDays size={15}/> Dates</dt><dd>{duration ? `${fmtDate(arrivals)} – ${fmtDate(departures)}` : 'Not set'}</dd></div><div><dt><Users size={15}/> Travellers</dt><dd>{people} people</dd></div><div><dt><MapPin size={15}/> Pick-up</dt><dd>{input.pickup || 'Not set'}</dd></div><div><dt><Palette size={15}/> PDF theme</dt><dd>{resolvePdfTheme(input.pdfTheme).name}</dd></div></dl><div className="trip-summary-packages">{selectedPackages.map(category => <span key={category}>{category}</span>)}</div><div className="trip-summary-budget"><span>Group budget</span><strong>{budgetText.trim() && Number(budgetText) > 0 ? money(Number(budgetText) * people) : 'Not set'}</strong></div>
              {plan && <div className="trip-draft-total"><span>{selectedPackages.length > 1 ? 'Package comparison' : draftNeedsRefresh ? 'Previous draft total' : 'Current draft total'}</span><strong>{selectedPackages.length > 1 ? `${selectedPackages.length} options` : money(calculateCosts(plan, hotelSelections, costModel).sellingTotal)}</strong></div>}
              {(draftNeedsRefresh || (plan && routeVersion !== ROUTE_VERSION)) && <p className="trip-draft-notice">{draftNeedsRefresh ? 'Trip details changed. Continue to update the itinerary.' : 'New route suggestions are available in Destinations.'}</p>}
            </div>
          </div>
        </details>
      </aside>
    </div>
  </main>;
}
