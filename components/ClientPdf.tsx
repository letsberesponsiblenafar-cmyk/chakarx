'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, CheckCircle2, Download, FileText, LockKeyhole } from 'lucide-react';
import { jsPDF } from 'jspdf';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner, type PaymentPlan } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';
import { dayNarrative, dayTitle } from '@/lib/narrative';
import { paymentAmounts } from '@/lib/pricing';

const PAGE_W = 540;
const PAGE_H = 787.9;
type RGB = [number, number, number];
const BROWN: RGB = [42, 23, 11];
const GOLD: RGB = [181, 145, 71];
const MUTED: RGB = [104, 91, 77];
const CREAM: RGB = [248, 243, 234];
const WHITE: RGB = [255, 255, 255];

type PdfTemplate = 'madiha' | 'asna';
const PDF_TEMPLATES: Record<PdfTemplate, { label: string; cover: string; policies: string }> = {
  madiha: { label: 'Madiha sample', cover: '/pdf-assets/madiha-cover-template.png', policies: '/pdf-assets/madiha-policies-template.png' },
  asna: { label: 'Asna sample', cover: '/pdf-assets/asna-cover-template.png', policies: '/pdf-assets/asna-policies-template.png' },
};

function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}
function shortDate(s: string) {
  if (!s) return '—';
  return new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function money(v: number) { return `Rs. ${Math.round(v).toLocaleString('en-IN')}/-`; }
function safe(s: unknown) { return String(s ?? '').trim(); }

function wrapped(doc: jsPDF, text: string, x: number, y: number, width: number, size: number, color: RGB, maxLines?: number, lineHeight = 1.28) {
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...color);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(safe(text), width) as string[];
  const used = maxLines ? lines.slice(0, maxLines) : lines;
  if (maxLines && lines.length > maxLines && used.length) used[used.length - 1] = `${used[used.length - 1].replace(/[.,;:!?]?\s*$/, '')}…`;
  doc.text(used, x, y, { lineHeightFactor: lineHeight });
  return { lines: used.length, height: used.length * size * lineHeight };
}

function pageNumber(doc: jsPDF) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(String(doc.getNumberOfPages()).padStart(2, '0'), PAGE_W - 28, PAGE_H - 20, { align: 'right' });
}

function sectionHeader(doc: jsPDF, eyebrow: string, title: string, subtitle?: string) {
  doc.setFillColor(...BROWN);
  doc.rect(0, 0, PAGE_W, 72, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text(eyebrow.toUpperCase(), 28, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  let titleLines = doc.splitTextToSize(safe(title), subtitle ? 330 : 470) as string[];
  if (titleLines.length > 1) {
    doc.setFontSize(14.5);
    titleLines = doc.splitTextToSize(safe(title), subtitle ? 330 : 470) as string[];
  }
  doc.setTextColor(...WHITE);
  const titleText = titleLines.length > 1 ? `${titleLines[0].replace(/[.,;:!?]?\s*$/, '')}…` : (titleLines[0] || '');
  doc.text(titleText, 28, 49);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(232, 224, 211);
    const sub = doc.splitTextToSize(safe(subtitle), 150) as string[];
    doc.text(sub[0] || '', PAGE_W - 28, 42, { align: 'right' });
  }
}

async function publicImageDataUrl(path: string): Promise<string> {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not load PDF artwork (${response.status}): ${path}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.startsWith('data:image/')) resolve(result);
      else reject(new Error(`PDF artwork could not be converted to an image: ${path}`));
    };
    reader.onerror = () => reject(new Error(`PDF artwork could not be read: ${path}`));
    reader.readAsDataURL(blob);
  });
}

async function addCover(doc: jsPDF, coverData: string, customerName: string, template: PdfTemplate) {
  doc.addImage(coverData, 'PNG', 0, 0, PAGE_W, PAGE_H, undefined, 'NONE');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  const greeting = `Dear ${customerName}${template === 'asna' ? ',' : ''}`;
  doc.text(greeting, 28.44, template === 'asna' ? 529.4 : 527.7);
}

function policyLine(booking: number, arrival: number) {
  return `${booking}% at the time of booking, ${arrival}% on arrival, and ${100-booking-arrival}% during the trip.`;
}

async function addPoliciesPage(doc: jsPDF, policiesData: string, paymentPlan: PaymentPlan) {
  doc.addPage();
  // The source artwork and legal text are fixed. Only the two payment lines
  // below were cleared from the source page for operator-selected percentages.
  doc.addImage(policiesData, 'PNG', 0, 0, PAGE_W, PAGE_H, undefined, 'NONE');
  for (const [index, key] of (['one', 'two'] as const).entries()) {
    const plan = paymentPlan[key];
    const y = 374.2 + index * 15.75;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11.1);
    doc.setFont('helvetica', 'bold'); doc.text(`Plan ${key === 'one' ? 'One' : 'Two'}:`, 38.7, y);
    doc.setFont('helvetica', 'normal'); doc.text(policyLine(plan.booking, plan.arrival), 95, y);
  }
}

function addJourneyOverview(doc: jsPDF, currentPlan: any, input: any) {
  doc.addPage();
  sectionHeader(doc, 'Your journey', 'Kashmir journey overview', `${currentPlan.nights} nights · ${currentPlan.days} days`);
  const facts = [
    ['Traveller', safe(input.name) || 'Traveler'],
    ['Travel dates', `${fmtDate(input.arrival)} → ${fmtDate(input.departure)}`],
    ['Pick-up point', safe(input.pickup) || 'Custom pick-up'],
    ['Travellers', `${input.adults} adults${input.youngAges?.length ? ` · ${input.youngAges.length} children` : ''}`],
    ['Itinerary category', safe(input.hotelCategory)],
    ['Meal plan', safe(input.mealPlan)],
  ];
  let y = 104;
  for (const [label, value] of facts) {
    doc.setFillColor(...CREAM);
    doc.roundedRect(28, y, 484, 52, 9, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(label.toUpperCase(), 42, y + 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...BROWN);
    wrapped(doc, value, 42, y + 37, 450, 10.5, BROWN, 2, 1.15);
    y += 62;
  }
  pageNumber(doc);
}

function addDayPage(doc: jsPDF, day: any, pickup: string) {
  doc.addPage();
  const title = dayTitle(day, pickup);
  sectionHeader(doc, `Day ${day.day}`, `${day.label === 'Departure day' ? 'Depart from' : 'Stay in'} ${safe(day.stay)}`, `${shortDate(day.date)} | ${safe(day.from)} to ${safe(day.to)}`);
  let y = 102;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...BROWN);
  doc.text(`Day ${day.day}`, 28, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...GOLD);
  const fullTitle = doc.splitTextToSize(title, 450) as string[];
  doc.text(fullTitle, 28, y + 23, { lineHeightFactor: 1.2 });
  y += 31 + fullTitle.length * 15.6;

  const aboutText = dayNarrative(day, pickup);
  const aboutLines = doc.splitTextToSize(aboutText, 438) as string[];
  let aboutOffset = 0;
  while (aboutOffset < aboutLines.length) {
    const available = Math.floor((PAGE_H - 55 - y - 60) / (8.7 * 1.32));
    if (available < 3) { pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · continued`); y = 100; continue; }
    const shown = aboutLines.slice(aboutOffset, aboutOffset + available);
    const aboutH = Math.max(116, 60 + shown.length * 8.7 * 1.32);
    doc.setFillColor(...CREAM); doc.roundedRect(28, y, 484, aboutH, 12, 12, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BROWN); doc.text(aboutOffset ? 'ABOUT THIS DAY · CONTINUED' : 'ABOUT THIS DAY', 44, y + 21);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7); doc.text(shown, 44, y + 41, { lineHeightFactor: 1.32 });
    y += aboutH + 18;
    aboutOffset += shown.length;
    if (aboutOffset < aboutLines.length) { pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · continued`); y = 100; }
  }

  const blocks = (day.blocks || []).filter((b: any) => b.kind !== 'departure' && b.kind !== 'arrival');
  if (blocks.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text('DAY FLOW', 28, y);
    y += 18;
  }
  for (const block of blocks) {
    const descLines = doc.splitTextToSize(safe(block.description), 420) as string[];
    let offset = 0;
    let first = true;
    do {
      const blockTitle = `${safe(block.name)}${first ? '' : ' · continued'}`;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2);
      const titleLines = doc.splitTextToSize(blockTitle, 420) as string[];
      const titleH = titleLines.length * 10.5;
      let available = Math.floor((PAGE_H - 50 - y - 35 - titleH) / (7.6 * 1.28));
      if (available < 1) {
        pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · continued`); y = 100;
        available = Math.floor((PAGE_H - 50 - y - 35 - titleH) / (7.6 * 1.28));
      }
      const shownDesc = descLines.slice(offset, offset + Math.max(1, available));
      const boxH = Math.max(52, 35 + titleH + shownDesc.length * 7.6 * 1.28);
      doc.setFillColor(250, 247, 241); doc.roundedRect(28, y, 484, boxH, 9, 9, 'F');
      doc.setFillColor(...GOLD); doc.circle(43, y + 16, 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.setTextColor(...BROWN);
      doc.text(titleLines, 55, y + 19, { lineHeightFactor: 1.15 });
      if (shownDesc.length) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...MUTED);
        doc.text(shownDesc, 55, y + 26 + titleH, { lineHeightFactor: 1.28 });
      }
      y += boxH + 9;
      offset += shownDesc.length;
      first = false;
    } while (offset < descLines.length);
  }

  if (day.notes?.length) {
    const noteText = day.notes.join(' ');
    const noteLines = doc.splitTextToSize(noteText, 438) as string[];
    let offset = 0;
    while (offset < noteLines.length) {
      let available = Math.floor((PAGE_H - 45 - y - 40) / (7.5 * 1.25));
      if (available < 1) { pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · notes`); y = 100; available = Math.floor((PAGE_H - 45 - y - 40) / (7.5 * 1.25)); }
      const shown = noteLines.slice(offset, offset + available);
      const noteH = Math.max(70, 40 + shown.length * 7.5 * 1.25);
      doc.setFillColor(244, 237, 222); doc.roundedRect(28, y, 484, noteH, 10, 10, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BROWN); doc.text(offset ? 'OPERATIONAL NOTES · CONTINUED' : 'OPERATIONAL NOTES', 44, y + 20);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(shown, 44, y + 39, { lineHeightFactor: 1.25 });
      y += noteH + 9;
      offset += shown.length;
    }
  }
  pageNumber(doc);
}

function addStaysPage(doc: jsPDF, hotels: any[]) {
  doc.addPage();
  sectionHeader(doc, 'Accommodation', 'Your selected stays', 'Customer-facing accommodation');
  let y = 100;
  for (const hotel of hotels) {
    const name = safe(hotel.hotelName) || 'Hotel to be confirmed';
    const meta = `${hotel.location} · ${hotel.nights} night${hotel.nights === 1 ? '' : 's'} · ${hotel.category || 'Selected category'}`;
    const room = `${hotel.rooms || 0} room${hotel.rooms === 1 ? '' : 's'}${hotel.extraBeds ? ` · ${hotel.extraBeds} extra bed${hotel.extraBeds === 1 ? '' : 's'}` : ''}${hotel.cnb ? ` · ${hotel.cnb} CNB` : ''}`;
    const cardH = 105;
    if (y + cardH > PAGE_H - 45) {
      pageNumber(doc);
      doc.addPage(); sectionHeader(doc, 'Accommodation', 'Your selected stays', 'Continued'); y = 100;
    }
    doc.setFillColor(...CREAM); doc.roundedRect(28, y, 484, cardH, 12, 12, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GOLD); doc.text(meta.toUpperCase(), 44, y + 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BROWN);
    wrapped(doc, name, 44, y + 45, 420, 13, BROWN, 2, 1.15);
    wrapped(doc, room, 44, y + 68, 420, 8, MUTED, 2);
    wrapped(doc, safe(hotel.address) || 'Final room assignment and availability subject to confirmation.', 44, y + 87, 420, 7.2, MUTED, 2);
    y += cardH + 12;
  }
  pageNumber(doc);
}

function addInvestmentPage(doc: jsPDF, costs: any, paymentPlan: PaymentPlan) {
  doc.addPage();
  sectionHeader(doc, 'Trip investment', 'Your package investment', 'Customer-facing pricing');
  const pricingPending = costs.missingHotelRates.length > 0;
  const value = (amount: number) => pricingPending ? 'To be confirmed' : money(amount);
  const rows = [
    ['Package price before GST', value(costs.subtotalAfterMarkup)],
    ['GST @ 5%', value(costs.gst)],
  ];
  let y = 112;
  for (const [label, value] of rows) {
    doc.setFillColor(...CREAM); doc.roundedRect(28, y, 484, 48, 8, 8, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(label.toUpperCase(), 44, y + 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BROWN); doc.text(value, 496, y + 30, { align: 'right' });
    y += 58;
  }
  doc.setFillColor(...BROWN); doc.roundedRect(28, y + 8, 484, 88, 12, 12, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GOLD); doc.text('CUSTOMER SELLING TOTAL', 44, y + 34);
  doc.setFontSize(pricingPending ? 15 : 23); doc.setTextColor(...WHITE); doc.text(pricingPending ? 'PRICING TO BE CONFIRMED' : money(costs.sellingTotal), 44, y + 70);
  wrapped(doc, 'The package investment reflects the current itinerary, hotels and selected inclusions. Availability and date-specific services remain subject to confirmation.', 44, y + 115, 440, 7.5, MUTED, 3);
  const schedule = paymentPlan[paymentPlan.selected];
  const amounts = paymentAmounts(costs.sellingTotal, schedule.booking, schedule.arrival);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BROWN); doc.text(`SELECTED PAYMENT PLAN ${paymentPlan.selected === 'one' ? 'ONE' : 'TWO'}`, 28, y + 165);
  const installments = [
    ['At booking', schedule.booking, amounts.booking],
    ['On arrival', schedule.arrival, amounts.arrival],
    ['During trip', amounts.duringPct, amounts.during],
  ] as const;
  installments.forEach(([label, percentage, amount], index) => {
    const x = 28 + index * 166;
    doc.setFillColor(...CREAM); doc.roundedRect(x, y + 180, 152, 64, 9, 9, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(`${label} · ${percentage}%`, x + 10, y + 200);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...BROWN); doc.text(pricingPending ? 'To be confirmed' : money(amount), x + 10, y + 225);
  });
  pageNumber(doc);
}

export default function ClientPdf() {
  const { plan, input, hotelSelections, costModel, paymentPlan } = usePlanner();
  const [downloading, setDownloading] = useState(false);
  const [template, setTemplate] = useState<PdfTemplate>('madiha');
  const selectedTemplate = PDF_TEMPLATES[template];
  const costs = plan ? calculateCosts(plan, hotelSelections, costModel) : null;

  if (!plan || !costs) return <PlannerChrome title="Client-ready itinerary PDF" eyebrow="STEP 04 · CLIENT PDF"><div className="empty-panel"><FileText size={28}/><h2>Complete the itinerary first.</h2><Link className="primary-cta inline" href="/">Build Your Trip</Link></div></PlannerChrome>;

  // Stable snapshots are intentionally created outside the async callback. This prevents
  // React state nullability from leaking into PDF generation and fixes TS18047 permanently.
  const currentPlan = plan;
  const currentCosts = costs;
  const selectedSchedule = paymentPlan[paymentPlan.selected];
  const previewAmounts = paymentAmounts(currentCosts.sellingTotal, selectedSchedule.booking, selectedSchedule.arrival);
  const customerName = safe(input.name) || 'Traveler';
  // A missing hotel rate must never disable PDF generation. The document can still
  // be generated and will explicitly mark the affected customer-facing prices as
  // 'To be confirmed'. Only the absence of a generated itinerary blocks the page.
  const pricingPending = currentCosts.missingHotelRates.length > 0;
  // The PDF is a document-generation step, not a hotel-validation gate. If a stay
  // has no selected hotel yet, we still create a clean 'Hotel to be confirmed' card.
  const pdfHotels = currentPlan.hotelPlans.map((stay) => hotelSelections.find((hotel) => hotel.location === stay.location) ?? ({
    location: stay.location, hotelName: 'Hotel to be confirmed', category: input.hotelCategory, nights: stay.nights,
    rooms: 0, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0, address: '',
  }));
  const pdfReady = currentPlan.dayPlans.length > 0;

  async function download() {
    if (!pdfReady) return;
    setDownloading(true);
    try {
      // jsPDF cannot reliably consume a public URL string in addImage(). Fetching
      // the artwork first and converting it to a data URL makes the generator
      // deterministic in Vercel, localhost and production browsers.
      const [coverData, policiesData] = await Promise.all([
        publicImageDataUrl(selectedTemplate.cover),
        publicImageDataUrl(selectedTemplate.policies),
      ]);

      const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], compress: true, orientation: 'portrait' });
      await addCover(doc, coverData, customerName, template);
      addJourneyOverview(doc, currentPlan, input);
      currentPlan.dayPlans.forEach((day) => addDayPage(doc, day, input.pickup));
      addInvestmentPage(doc, currentCosts, paymentPlan);
      addStaysPage(doc, pdfHotels);
      await addPoliciesPage(doc, policiesData, paymentPlan);

      const blob = doc.output('blob');
      if (!blob || blob.size < 1024) throw new Error('The PDF engine returned an empty document.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Chakar-Experience-${customerName.replace(/[^a-z0-9]+/gi, '-')}-Kashmir-Itinerary.pdf`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) {
      console.error('Chakar PDF generation failed:', error);
      window.alert(error instanceof Error ? error.message : 'Could not generate the client PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return <PlannerChrome title="Client-ready itinerary PDF" eyebrow="STEP 04 · CLIENT PDF">
    <section className="pdf-hero">
      <div className="pdf-brand-lockup"><img src="/chakar-experience-logo.png" alt="Chakar Experience"/><span>DISCOVER KASHMIR · HEAVEN ON EARTH</span></div>
      <h2>{customerName}'s Kashmir journey</h2>
      <p>The cover artwork and Policies page follow your supplied PDF examples. Itinerary, hotels and pricing use the current planner values.</p>
      <div className="pdf-template-picker" role="group" aria-label="PDF reference design"><span>Reference artwork</span><div>{(Object.keys(PDF_TEMPLATES) as PdfTemplate[]).map((key)=><button type="button" key={key} className={template===key?'active':''} aria-pressed={template===key} onClick={()=>setTemplate(key)}>{PDF_TEMPLATES[key].label}<small>Same page design; payment percentages come from Costing</small></button>)}</div></div>
      {pricingPending && <div className="pdf-block-warning"><LockKeyhole size={15}/><span><b>PDF can still be generated.</b> Hotel rates for {currentCosts.missingHotelRates.join(', ')} are pending, so affected customer-facing prices will be marked “To be confirmed”.</span></div>}
      {!pdfReady && <div className="pdf-block-warning"><LockKeyhole size={15}/><span><b>Itinerary is incomplete.</b> Generate the itinerary before creating the PDF.</span></div>}
      <button className="primary-cta inline" onClick={download} disabled={downloading || !pdfReady}><Download size={17}/>{downloading ? 'Preparing PDF…' : 'Download client PDF'}</button>
    </section>

    <section className="pdf-preview">
      <div className="section-head"><div><span className="eyebrow">PDF PREVIEW</span><h2>Customer document</h2><p>The selected cover and Policies artwork come from the supplied sample PDF.</p></div></div>
      <div className="pdf-preview-stack">
        <article className="pdf-preview-page cover"><img src={selectedTemplate.cover} alt={`${selectedTemplate.label} cover artwork`}/><div className={`pdf-preview-greeting ${template}`}>Dear {customerName}{template==='asna'?',':''}</div><span>01</span></article>
        <article className="pdf-preview-page"><span>OVERVIEW</span><h3>Kashmir journey overview</h3><div className="pdf-preview-facts">{[['Traveller',customerName],['Travel dates',`${fmtDate(input.arrival)} → ${fmtDate(input.departure)}`],['Pick-up',input.pickup||'Custom pick-up'],['Travellers',`${input.adults} adults · ${input.youngAges.length} children`],['Category',input.hotelCategory],['Meal plan',input.mealPlan]].map(x=><div key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></div>)}</div></article>
        {currentPlan.dayPlans.map((day) => <article className="pdf-preview-page" key={`${day.day}-${day.date}`}><span>DAY {String(day.day).padStart(2, '0')}</span><h3>{dayTitle(day, input.pickup)}</h3><small>{shortDate(day.date)} · {day.from} → {day.to}</small><div className="preview-about"><b>ABOUT THIS DAY</b><p>{dayNarrative(day, input.pickup)}</p></div></article>)}
        <article className="pdf-preview-page"><span>QUOTE</span><h3>Trip investment</h3><div className="pdf-preview-facts"><div><small>Package before GST</small><b>{pricingPending?'To be confirmed':money(currentCosts.subtotalAfterMarkup)}</b></div><div><small>GST @ 5%</small><b>{pricingPending?'To be confirmed':money(currentCosts.gst)}</b></div></div><div className="pdf-preview-total"><small>Customer selling total</small><b>{pricingPending?'To be confirmed':money(currentCosts.sellingTotal)}</b></div><div className="pdf-preview-facts"><div><small>Selected payment plan {paymentPlan.selected==='one'?'One':'Two'}</small><b>{selectedSchedule.booking}% booking: {pricingPending?'To be confirmed':money(previewAmounts.booking)}</b><b>{selectedSchedule.arrival}% arrival: {pricingPending?'To be confirmed':money(previewAmounts.arrival)}</b><b>{previewAmounts.duringPct}% during trip: {pricingPending?'To be confirmed':money(previewAmounts.during)}</b></div></div></article>
        <article className="pdf-preview-page cover"><img src={selectedTemplate.policies} alt={`${selectedTemplate.label} Policies page artwork`}/><div className="pdf-policy-lines"><div><b>Plan One:</b> {policyLine(paymentPlan.one.booking,paymentPlan.one.arrival)}</div><div><b>Plan Two:</b> {policyLine(paymentPlan.two.booking,paymentPlan.two.arrival)}</div></div><span>POLICIES</span></article>
      </div>
    </section>

    <div className="pdf-page-list"><div><CheckCircle2 size={18}/><span>Supplied cover layout with the current traveller's name</span></div><div><CheckCircle2 size={18}/><span>Policies artwork stays fixed; selected payment percentages update</span></div><div><CheckCircle2 size={18}/><span>Day text can continue on a new page</span></div><div><CheckCircle2 size={18}/><span>Current hotel details and selling total</span></div><div><LockKeyhole size={18}/><span>Supplier rates and internal profit stay out of the customer PDF</span></div></div>
    <div className="next-row"><Link className="secondary-link" href="/planner/costing"><ChevronLeft size={16}/> Back to costing</Link><Link className="primary-cta inline" href="/">Start another trip</Link></div>
  </PlannerChrome>;
}
