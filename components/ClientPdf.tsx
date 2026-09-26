'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, CheckCircle2, Download, FileText, LockKeyhole } from 'lucide-react';
import { jsPDF } from 'jspdf';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';
import { destinationByName } from '@/lib/data';

const PAGE_W = 540;
const PAGE_H = 780;
type RGB = [number, number, number];
const BROWN: RGB = [42, 23, 11];
const GOLD: RGB = [181, 145, 71];
const MUTED: RGB = [104, 91, 77];
const CREAM: RGB = [248, 243, 234];
const WHITE: RGB = [255, 255, 255];

const COVER_MASTER = '/pdf-assets/chakar-cover-master.jpg';
const RULES_MASTER = '/pdf-assets/chakar-rules-master.jpg';

const FIXED_PACKAGE_RULES = [
  'Standard package transport covers the planned route according to the selected vehicle and rate rules.',
  'Union/local cabs are excluded unless specifically added to the quotation.',
  'Pony rides, ATV rides and river rafting are excluded unless specifically quoted.',
  'Gondola tickets are excluded unless the package explicitly includes them.',
  'Snow activities, skiing, snowboarding, sledging and snowmobile/snowbike rides are optional and normally extra.',
  'Fishing/angling may require permits and is treated as an optional paid activity.',
  'Protected-area visits require current entry, permit and timing checks.',
  'Remote/border-area excursions require current local, security and access confirmation.',
];

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
  const titleLines = doc.splitTextToSize(safe(title), subtitle ? 330 : 470) as string[];
  doc.setFontSize(titleLines.length > 1 ? 14.5 : 18);
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

async function addCover(doc: jsPDF, coverData: string) {
  doc.addImage(coverData, 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'NONE');
}

async function addRulesPage(doc: jsPDF, rulesData: string) {
  doc.addPage();
  doc.addImage(rulesData, 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'NONE');
  // The supplied master intentionally leaves the upper amber area open for the
  // fixed package rules. Nothing is drawn over the photographic lower half.
  doc.setTextColor(...BROWN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Package Notes & Exclusions', 34, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.1);
  let y = 66;
  for (const rule of FIXED_PACKAGE_RULES) {
    const block = wrapped(doc, `• ${rule}`, 36, y, 468, 7.1, BROWN, 2, 1.22);
    y += block.height + 4.5;
    if (y > 385) break;
  }
  pageNumber(doc);
}

function dayAbout(day: any) {
  if (safe(day.customAbout)) return safe(day.customAbout);
  const destination = destinationByName(safe(day.stay));
  const arrival = (day.blocks || []).find((b: any) => b.kind === 'arrival');
  const arrivalText = safe(arrival?.description);
  const baseText = safe(destination?.description) || `A considered day in ${safe(day.stay)}, shaped around the destination and the transfer schedule.`;
  if (arrivalText) return `${arrivalText} ${baseText}`.trim();
  return baseText;
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

function addDayPage(doc: jsPDF, day: any) {
  doc.addPage();
  const title = safe(day.customTitle) || (day.day === 1 ? `Arrival in ${safe(day.from || day.stay)} & ${safe(day.stay)} local sightseeing` : safe(day.stay) || 'Kashmir');
  sectionHeader(doc, `Day ${day.day}`, title, `${shortDate(day.date)} · ${safe(day.from)} → ${safe(day.to)}`);
  let y = 102;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...BROWN);
  doc.text(`Day ${day.day}`, 28, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...GOLD);
  const stayTitle = doc.splitTextToSize(safe(day.stay) || 'Kashmir', 430) as string[];
  doc.text(stayTitle[0] || 'Kashmir', 28, y + 22);
  y += 48;

  const aboutText = dayAbout(day);
  const aboutLines = doc.splitTextToSize(aboutText, 438) as string[];
  const aboutUsed = Math.min(aboutLines.length, 7);
  const aboutH = Math.max(116, 42 + aboutUsed * 9.1 + 22);
  if (y + aboutH > PAGE_H - 50) { pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · continued`); y = 100; }
  doc.setFillColor(...CREAM); doc.roundedRect(28, y, 484, aboutH, 12, 12, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BROWN); doc.text('ABOUT THIS DAY', 44, y + 21);
  wrapped(doc, aboutText, 44, y + 41, 438, 8.7, BROWN, 7, 1.32);
  y += aboutH + 18;

  const blocks = (day.blocks || []).filter((b: any) => b.kind !== 'departure' && b.kind !== 'arrival');
  if (blocks.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text('DAY FLOW', 28, y);
    y += 18;
  }
  for (const block of blocks) {
    const titleText = safe(block.name);
    const desc = safe(block.description);
    const titleLines = doc.splitTextToSize(titleText, 435) as string[];
    const descLines = doc.splitTextToSize(desc, 420) as string[];
    const titleUsed = Math.min(titleLines.length, 2);
    const descUsed = Math.min(descLines.length, 4);
    const boxH = Math.max(52, 20 + titleUsed * 10.5 + descUsed * 7.6 * 1.28 + 15);
    if (y + boxH > PAGE_H - 50) {
      pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · continued`); y = 100;
    }
    doc.setFillColor(250, 247, 241); doc.roundedRect(28, y, 484, boxH, 9, 9, 'F');
    doc.setFillColor(...GOLD); doc.circle(43, y + 16, 3, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.setTextColor(...BROWN);
    const shownTitle = titleLines.slice(0, titleUsed); if (titleLines.length > titleUsed && shownTitle.length) shownTitle[shownTitle.length-1] += '…';
    doc.text(shownTitle, 55, y + 19, { lineHeightFactor: 1.15 });
    wrapped(doc, desc, 55, y + 35 + (titleUsed - 1) * 10, 420, 7.6, MUTED, descUsed, 1.28);
    y += boxH + 9;
  }

  if (day.notes?.length) {
    const noteText = day.notes.join(' ');
    const noteLines = doc.splitTextToSize(noteText, 438) as string[];
    const noteH = Math.max(70, 40 + Math.min(noteLines.length, 5) * 7.5 * 1.25);
    if (y + noteH > PAGE_H - 40) { pageNumber(doc); doc.addPage(); sectionHeader(doc, `Day ${day.day}`, `${safe(day.stay)} · notes`); y = 100; }
    doc.setFillColor(244, 237, 222); doc.roundedRect(28, y, 484, noteH, 10, 10, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BROWN); doc.text('OPERATIONAL NOTES', 44, y + 20);
    wrapped(doc, noteText, 44, y + 39, 438, 7.5, MUTED, 5, 1.25);
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

function addInvestmentPage(doc: jsPDF, costs: any) {
  doc.addPage();
  sectionHeader(doc, 'Trip investment', 'Your package investment', 'Customer-facing pricing');
  const pricingPending = costs.missingHotelRates.length > 0;
  const value = (amount: number) => pricingPending ? 'To be confirmed' : money(amount);
  const rows = [
    ['Accommodation', value(costs.accommodation)],
    ['Transport', money(costs.transport)],
    ['Others', money(costs.other)],
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
  wrapped(doc, 'Internal B2B rates and profit/markup are kept private and are not displayed in the client document.', 44, y + 115, 440, 7.5, MUTED, 3);
  pageNumber(doc);
}

export default function ClientPdf() {
  const { plan, input, hotelSelections, costModel } = usePlanner();
  const [downloading, setDownloading] = useState(false);
  const costs = plan ? calculateCosts(plan, hotelSelections, costModel) : null;

  if (!plan || !costs) return <PlannerChrome title="Client-ready itinerary PDF" eyebrow="STEP 04 · CLIENT PDF"><div className="empty-panel"><FileText size={28}/><h2>Complete the itinerary first.</h2><Link className="primary-cta inline" href="/">Build Your Trip</Link></div></PlannerChrome>;

  // Stable snapshots are intentionally created outside the async callback. This prevents
  // React state nullability from leaking into PDF generation and fixes TS18047 permanently.
  const currentPlan = plan;
  const currentCosts = costs;
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
      const [coverData, rulesData] = await Promise.all([
        publicImageDataUrl(COVER_MASTER),
        publicImageDataUrl(RULES_MASTER),
      ]);

      const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], compress: true, orientation: 'portrait' });
      await addCover(doc, coverData);
      await addRulesPage(doc, rulesData);
      addJourneyOverview(doc, currentPlan, input);
      currentPlan.dayPlans.forEach((day) => addDayPage(doc, day));
      addStaysPage(doc, pdfHotels);
      addInvestmentPage(doc, currentCosts);

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
      <p>The client document uses the supplied Chakar artwork as fixed master pages. Dynamic itinerary, hotel and pricing data are placed in bounded content areas so text can wrap and continue to a new page instead of colliding.</p>
      {pricingPending && <div className="pdf-block-warning"><LockKeyhole size={15}/><span><b>PDF can still be generated.</b> Hotel rates for {currentCosts.missingHotelRates.join(', ')} are pending, so affected customer-facing prices will be marked “To be confirmed”.</span></div>}
      {!pdfReady && <div className="pdf-block-warning"><LockKeyhole size={15}/><span><b>Itinerary is incomplete.</b> Generate the itinerary before creating the PDF.</span></div>}
      <button className="primary-cta inline" onClick={download} disabled={downloading || !pdfReady}><Download size={17}/>{downloading ? 'Preparing PDF…' : 'Download client PDF'}</button>
    </section>

    <section className="pdf-preview">
      <div className="section-head"><div><span className="eyebrow">PDF PREVIEW</span><h2>Customer document</h2><p>The first page and fixed artwork are preserved from the supplied masters.</p></div></div>
      <div className="pdf-preview-stack">
        <article className="pdf-preview-page cover"><img src={COVER_MASTER} alt="Chakar supplied cover"/><span>01</span></article>
        <article className="pdf-preview-page cover"><img src={RULES_MASTER} alt="Chakar supplied rules page artwork"/><div className="preview-rules-overlay"><b>Package Notes & Exclusions</b><ul>{FIXED_PACKAGE_RULES.slice(0, 5).map((rule) => <li key={rule}>{rule}</li>)}</ul></div><span>02</span></article>
        <article className="pdf-preview-page"><span>03</span><h3>Kashmir journey overview</h3><div className="pdf-preview-facts">{[['Traveller',customerName],['Travel dates',`${fmtDate(input.arrival)} → ${fmtDate(input.departure)}`],['Pick-up',input.pickup||'Custom pick-up'],['Travellers',`${input.adults} adults · ${input.youngAges.length} children`],['Category',input.hotelCategory],['Meal plan',input.mealPlan]].map(x=><div key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></div>)}</div></article>
        {currentPlan.dayPlans.map((day, index) => <article className="pdf-preview-page" key={`${day.day}-${day.date}`}><span>{String(index + 4).padStart(2, '0')}</span><h3>Day {day.day} · {day.stay}</h3><small>{shortDate(day.date)} · {day.from} → {day.to}</small><div className="preview-about"><b>ABOUT THIS DAY</b><p>{dayAbout(day)}</p></div></article>)}
        <article className="pdf-preview-page"><span>LAST</span><h3>Trip investment</h3><div className="pdf-preview-total"><small>Customer selling total</small><b>{money(currentCosts.sellingTotal)}</b></div><div className="pdf-preview-facts"><div><small>Accommodation</small><b>{money(currentCosts.accommodation)}</b></div><div><small>Transport</small><b>{money(currentCosts.transport)}</b></div><div><small>Others</small><b>{money(currentCosts.other)}</b></div><div><small>GST @ 5%</small><b>{money(currentCosts.gst)}</b></div></div></article>
      </div>
    </section>

    <div className="pdf-page-list"><div><CheckCircle2 size={18}/><span>Supplied cover artwork is preserved as the first PDF page</span></div><div><CheckCircle2 size={18}/><span>Fixed package notes remain consistent across generated PDFs</span></div><div><CheckCircle2 size={18}/><span>Day-wise About sections with bounded text flow</span></div><div><CheckCircle2 size={18}/><span>Selected hotel details and customer-facing pricing</span></div><div><LockKeyhole size={18}/><span>B2B rates and internal profit stay private</span></div></div>
    <div className="next-row"><Link className="secondary-link" href="/planner/costing"><ChevronLeft size={16}/> Back to costing</Link><Link className="primary-cta inline" href="/">Start another trip</Link></div>
  </PlannerChrome>;
}
