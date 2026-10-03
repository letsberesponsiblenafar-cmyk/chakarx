'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Download, FileText, FolderOpen, Info } from 'lucide-react';
import { jsPDF } from 'jspdf';
import PlannerChrome from '@/components/PlannerChrome';
import { usePlanner, type HotelSelection } from '@/components/PlannerProvider';
import { calculateCosts } from '@/lib/costing';
import { dayNarrative, dayTitle } from '@/lib/narrative';
import type { DayPlan, Plan, TripInput } from '@/lib/itinerary';
import { savePlannerItinerary } from '@/lib/save-itinerary';

const PAGE_W = 540;
const PAGE_H = 780;
const ART = {
  cover: '/pdf-assets/branded-cover.png',
  letter: '/pdf-assets/branded-letter.jpg',
  summary: '/pdf-assets/branded-summary.jpg',
  daywise: '/pdf-assets/standard-daywise.jpg',
  package: '/pdf-assets/branded-package.jpg',
  hotels: '/pdf-assets/branded-hotels.jpg',
  inclusions: '/pdf-assets/branded-inclusions.jpg',
  exclusions: '/pdf-assets/branded-exclusions.jpg',
  policies: '/pdf-assets/branded-policies.jpg',
  testimonials: '/pdf-assets/branded-testimonials.jpg',
  thanks: '/pdf-assets/standard-thanks.jpg',
} as const;
type ArtKey = keyof typeof ART;
type Costs = ReturnType<typeof calculateCosts>;
type PdfHotel = HotelSelection & { nightNumbers: number[] };
type PdfFonts = { regular: string; bold: string; cover: string };
type PdfArt = Record<ArtKey,string> & {brandWhite?:string; brandInk?:string};

function printable(value: unknown) {
  return String(value ?? '').trim().replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,'-').replace(/→/g,'to').replace(/≤/g,'<=');
}
function date(value: string, short = false) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: short ? 'short' : 'long', year: 'numeric' });
}
function money(value: number) { return `Rs. ${Math.round(value).toLocaleString('en-IN')}/-`; }
function uiMoney(value: number) { return `₹${Math.round(value).toLocaleString('en-IN')}`; }
function center(doc: jsPDF, value: string, x: number, y: number, size: number, color: [number,number,number] = [30,24,18], bold = false) {
  doc.setFont('evolventa', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(printable(value), x, y, { align: 'center' });
}
function textLines(doc: jsPDF, value: string, width: number, size: number, bold = false) {
  doc.setFont('evolventa', bold ? 'bold' : 'normal'); doc.setFontSize(size);
  return doc.splitTextToSize(printable(value), width) as string[];
}
async function imageData(path: string) {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not load itinerary artwork: ${path}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not read artwork: ${path}`));
    reader.onerror = () => reject(new Error(`Could not read artwork: ${path}`));
    reader.readAsDataURL(blob);
  });
}
async function packageArtworkWithoutRateDisclaimer(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare package artwork.');
  context.drawImage(image, 0, 0);
  // The supplied artwork has an old 24-hour rate disclaimer baked into its
  // bottom margin. Replace that margin with the same blank paper texture.
  const start = Math.floor(canvas.height * .89);
  context.drawImage(image, 0, Math.floor(canvas.height * .78), canvas.width, canvas.height - start, 0, start, canvas.width, canvas.height - start);
  return canvas.toDataURL('image/jpeg', .96);
}
function artworkPage(doc: jsPDF, data: PdfArt, key: ArtKey, first = false) {
  if (!first) doc.addPage();
  doc.addImage(data[key], key === 'cover' ? 'PNG' : 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST');
  if (key === 'thanks') return;
  const lightArt = key === 'cover' || key === 'letter' || key === 'inclusions' || key === 'exclusions' || key === 'policies' || key === 'testimonials';
  const logo = lightArt ? data.brandWhite : data.brandInk;
  if (!logo) return;
  const left = key === 'cover' || key === 'letter';
  const x = left ? 18 : 413, y = left ? 8 : 6, width = left ? 134 : 119;
  doc.addImage(logo, 'PNG', x, y, width, width * 223 / 593, undefined, 'NONE');
}
function addCover(doc: jsPDF, data: PdfArt, name: string) {
  artworkPage(doc, data, 'cover', true);
  doc.setFont('redhat','normal'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text(`Dear ${printable(name)},`, 28.44, 529.4);
}
function addSummary(doc: jsPDF, data: Record<ArtKey,string>, plan: Plan, input: TripInput) {
  artworkPage(doc, data, 'summary');
  center(doc, `${plan.nights} Nights / ${plan.days} Days`, 196, 194, 15, [30,24,18], true);
  center(doc, date(input.arrival), 345, 312, 12.5, [30,24,18], true);
  center(doc, date(input.departure), 174, 423, 12.5, [30,24,18], true);
  center(doc, input.pickup || 'Pick-up to confirm', 352, 530, 12.5, [30,24,18], true);
  const persons = `${input.adults} adult${input.adults === 1 ? '' : 's'}${input.youngAges.length ? ` plus ${input.youngAges.length} child${input.youngAges.length === 1 ? '' : 'ren'} (${input.youngAges.join(', ')} yrs)` : ''}`;
  const lines = textLines(doc, persons, 250, 11);
  doc.setTextColor(30,24,18); doc.text(lines.slice(0,2), 80, 646, { lineHeightFactor: 1.13 });
  doc.setFont('evolventa','normal'); doc.setFontSize(10); doc.text('Number of persons',80,lines.length>1?681:668);
}
function dayLayout(doc: jsPDF, day: DayPlan, pickup: string) {
  const title = `${date(day.date, true)} - ${dayTitle(day,pickup)}`;
  const titleLines = textLines(doc, title, 346, 10, true);
  const storyLines = textLines(doc, dayNarrative(day,pickup), 350, 8.9);
  return { titleLines, storyLines, height: titleLines.length * 12 + 12 + storyLines.length * 11 + 14 };
}
function addDaywise(doc: jsPDF, data: Record<ArtKey,string>, plan: Plan, pickup: string) {
  let index = 0;
  while (index < plan.dayPlans.length) {
    artworkPage(doc, data, 'daywise');
    doc.setFont('evolventa','normal'); doc.setFontSize(9.5); doc.setTextColor(40,29,14);
    doc.text(`${plan.nights} Nights / ${plan.days} Days`, 32, 83);
    let y = 150; let onPage = 0;
    while (index < plan.dayPlans.length && onPage < 5) {
      const day = plan.dayPlans[index];
      const layout = dayLayout(doc,day,pickup);
      if (onPage > 0 && y + layout.height > 602) break;
      doc.setFont('evolventa','bold'); doc.setFontSize(10.5); doc.setTextColor(58,40,13);
      doc.text(`Day ${day.day}-`, 30, y + 2);
      doc.setFont('evolventa','bold'); doc.setFontSize(10); doc.setTextColor(31,25,19);
      doc.text(layout.titleLines, 84, y, { lineHeightFactor: 1.2 });
      let bodyY = y + layout.titleLines.length * 12;
      doc.setFont('evolventa','bold'); doc.setFontSize(8.9); doc.text(day.label === 'Departure day' ? `Departure: ${printable(day.to)} (previous night: ${printable(day.stay)})` : `Overnight: ${printable(day.stay)}`, 84, bodyY + 2);
      bodyY += 12;
      doc.setFont('evolventa','normal'); doc.setFontSize(8.9); doc.setTextColor(38,33,29);
      doc.text(layout.storyLines, 84, bodyY + 2, { lineHeightFactor: 1.22 });
      y += layout.height; onPage++; index++;
    }
  }
}
function roomSummary(hotels: PdfHotel[]) {
  const rooms = [...new Set(hotels.map((hotel)=>hotel.rooms))].sort((a,b)=>a-b);
  const beds = Math.max(0,...hotels.map((hotel)=>hotel.extraBeds));
  const label = rooms.length <= 1 ? `${rooms[0] || 1} room${rooms[0] === 1 ? '' : 's'}` : `${rooms[0]}-${rooms[rooms.length-1]} rooms by stay`;
  return `${label}${beds ? `, ${beds} extra bed${beds===1?'':'s'}` : ''}`;
}
function addPackage(doc: jsPDF, data: Record<ArtKey,string>, plan: Plan, input: TripInput, hotels: PdfHotel[], costs: Costs) {
  artworkPage(doc, data, 'package');
  center(doc, `${plan.nights}N/${plan.days}D Trip Investments`, 268, 106, 15, [255,255,255]);
  center(doc, 'Hotel Category', 165, 181, 11, [255,255,255]);
  center(doc, input.hotelCategory, 383, 181, 12, [255,255,255], true);
  center(doc, 'Total Investment:', 165, 254, 11, [255,255,255]);
  center(doc, money(costs.sellingTotal), 383, 255, 14, [28,24,19], true);
  const cellCenters=[77,194,324,445];
  ['Features','Transport','Meal Plan','Number of Rooms'].forEach((label,i)=>center(doc,label,cellCenters[i],465,i===3?8.2:9.5,[255,255,255]));
  center(doc, 'Details', cellCenters[0], 547, 10, [255,255,255]);
  const vehicleLines=textLines(doc,input.transport,106,9.2);
  doc.setTextColor(30,24,18); doc.text(vehicleLines,cellCenters[1],vehicleLines.length>1?541:547,{align:'center',lineHeightFactor:1.1});
  const mealLines = textLines(doc,input.mealPlan,108,9.2);
  doc.text(mealLines,cellCenters[2],mealLines.length>1?541:547,{align:'center',lineHeightFactor:1.1});
  const roomLines = textLines(doc,roomSummary(hotels),103,8.2);
  doc.text(roomLines,cellCenters[3],roomLines.length>1?540:547,{align:'center',lineHeightFactor:1.15});
}
function addHotelPages(doc: jsPDF, data: Record<ArtKey,string>, hotels: PdfHotel[], category: string) {
  const rows = hotels.length ? hotels : [];
  for (let start=0; start<Math.max(1,rows.length); start+=4) {
    artworkPage(doc,data,'hotels');
    center(doc,'Category',159,220,11,[255,255,255]);
    center(doc,category,382,220,11,[255,255,255],true);
    rows.slice(start,start+4).forEach((hotel,i)=>{
      const y=[296,413,537,659][i];
      center(doc,`${hotel.location} ${hotel.nights}N`,160,y,10,[255,255,255],true);
      const nights=`Nights ${hotel.nightNumbers.join(', ')}`;
      center(doc,nights,160,y+14,7.2,[255,255,255]);
      const lines=textLines(doc,hotel.hotelName||'Hotel to be confirmed',187,9.6);
      doc.setTextColor(255,255,255); doc.text(lines.slice(0,3),382,y-(Math.min(lines.length,3)-1)*5,{align:'center',lineHeightFactor:1.1});
    });
  }
}
function pdfHotels(plan: Plan, selections: HotelSelection[], input: TripInput): PdfHotel[] {
  return plan.hotelPlans.map((row)=>{
    const existing=selections.find((hotel)=>hotel.location===row.location);
    const nightNumbers=plan.dayPlans.slice(0,plan.nights).filter((day)=>day.stay===row.location).map((day)=>day.day);
    return {...(existing || {
      location:row.location,hotelId:'',hotelName:'Hotel to be confirmed',category:input.hotelCategory,starRating:null,address:'',roomType:'',website:'',nights:row.nights,rooms:1,extraBeds:0,cnb:0,nightlyRate:0,extraBedRate:0,cnbRate:0,source:'',status:'',
    }),nights:row.nights,nightNumbers};
  });
}

export function buildClientPdf(data: PdfArt, plan: Plan, input: TripInput, selections: HotelSelection[], costs: Costs, customerName: string, fonts: PdfFonts) {
  const doc=new jsPDF({unit:'pt',format:[PAGE_W,PAGE_H],orientation:'portrait',compress:true});
  doc.addFileToVFS('Evolventa-Regular.ttf', fonts.regular);
  doc.addFileToVFS('Evolventa-Bold.ttf', fonts.bold);
  doc.addFileToVFS('RedHatDisplay-400.ttf', fonts.cover);
  doc.addFont('Evolventa-Regular.ttf', 'evolventa', 'normal');
  doc.addFont('Evolventa-Bold.ttf', 'evolventa', 'bold');
  doc.addFont('RedHatDisplay-400.ttf', 'redhat', 'normal');
  const hotels=pdfHotels(plan,selections,input);
  addCover(doc,data,customerName);
  artworkPage(doc,data,'letter');
  addSummary(doc,data,plan,input);
  addDaywise(doc,data,plan,input.pickup);
  addPackage(doc,data,plan,input,hotels,costs);
  addHotelPages(doc,data,hotels,input.hotelCategory);
  (['inclusions','exclusions','policies','testimonials','thanks'] as const).forEach((key)=>artworkPage(doc,data,key));
  return doc;
}

export default function ClientPdf() {
  const planner = usePlanner();
  const { plan, input, hotelSelections, costModel, hydrated, markSavedItinerary, reset } = planner;
  const [downloading,setDownloading] = useState(false);
  const [saveState,setSaveState] = useState<'saving'|'saved'|'error'>('saving');
  const [saveError,setSaveError] = useState('');
  const arrivalSave = useRef<Promise<string> | null>(null);
  function ensureSaved(): Promise<string> {
    if (!arrivalSave.current) {
      setSaveState('saving'); setSaveError('');
      arrivalSave.current = savePlannerItinerary(planner,false).then((id) => {
        markSavedItinerary(id);
        setSaveState('saved');
        return id;
      }).catch((cause) => {
        arrivalSave.current = null;
        setSaveState('error');
        setSaveError(cause instanceof Error ? cause.message : 'Could not save this itinerary.');
        throw cause;
      });
    }
    return arrivalSave.current;
  }
  useEffect(() => {
    if (hydrated && plan) void ensureSaved().catch(() => {});
  }, [hydrated, plan]);
  const costs = plan ? calculateCosts(plan,hotelSelections,costModel) : null;
  if (!hydrated) return <PlannerChrome title="Client-ready itinerary PDF" eyebrow="STEP 04 · CLIENT PDF"><div className="empty-panel"><FileText size={28}/><h2>Loading your itinerary PDF…</h2></div></PlannerChrome>;
  if (!plan || !costs) return <PlannerChrome title="Client-ready itinerary PDF" eyebrow="STEP 04 · CLIENT PDF"><div className="empty-panel"><FileText size={28}/><h2>Complete the itinerary first.</h2><Link className="primary-cta inline" href="/">Build Your Trip</Link></div></PlannerChrome>;

  const currentPlan=plan; const currentCosts=costs; const currentInput=input;
  const hotels=pdfHotels(currentPlan,hotelSelections,currentInput);
  const customerName=printable(input.name)||'Traveller';
  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const entries=await Promise.all((Object.keys(ART) as ArtKey[]).map(async (key)=>[key,await imageData(ART[key])] as const));
      const data=Object.fromEntries(entries) as PdfArt;
      data.package=await packageArtworkWithoutRateDisclaimer(data.package);
      [data.brandWhite,data.brandInk]=await Promise.all([imageData('/chakar-logo-original-white.png'),imageData('/chakar-logo-original-ink.png')]);
      const [regular,bold,cover]=await Promise.all([imageData('/fonts/Evolventa-Regular.ttf'),imageData('/fonts/Evolventa-Bold.ttf'),imageData('/fonts/RedHatDisplay-400.ttf')]);
      const doc=buildClientPdf(data,currentPlan,currentInput,hotelSelections,currentCosts,customerName,{regular:regular.split(',')[1],bold:bold.split(',')[1],cover:cover.split(',')[1]});
      const blob=doc.output('blob');
      if (!blob || blob.size<1024) throw new Error('The PDF engine returned an empty document.');
      // The saved record is committed before offering the file, so a successful
      // download always has an editable copy in the admin workspace.
      const savedId=await ensureSaved();
      const id=await savePlannerItinerary({...planner,savedItineraryId:savedId},true);
      markSavedItinerary(id);
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url; anchor.download=`Chakar-Experience-${customerName.replace(/[^a-z0-9]+/gi,'-')}-Kashmir-Itinerary.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),3000);
    } catch (error) {
      console.error('Chakar PDF generation failed:',error);
      window.alert(error instanceof Error?error.message:'Could not generate the client PDF.');
    } finally { setDownloading(false); }
  }

  return <PlannerChrome title="Client-ready itinerary PDF" eyebrow="STEP 04 · CLIENT PDF">
    <section className="pdf-hero"><div className="pdf-brand-lockup"><span className="original-logo" role="img" aria-label="Chakar Experience"/><span>DISCOVER KASHMIR · HEAVEN ON EARTH</span></div><h2>{customerName}&apos;s Kashmir journey</h2><p>The client document follows the supplied Chakar itinerary: cover and letter, tour summary, compact day-wise itinerary, package and hotel tables, then the fixed inclusions, exclusions, policies, testimonials and thank-you page.</p><div className={`pdf-save-state ${saveState}`} role="status">{saveState==='saving'?'Saving this client itinerary to the workspace…':saveState==='saved'?'Saved to Saved Itineraries. You can edit and download it again anytime.':<><span>Automatic save failed: {saveError}</span><button type="button" onClick={()=>void ensureSaved().catch(()=>{})}>Retry save</button></>}</div>{currentCosts.missingHotelRates.length>0&&<div className="pdf-block-warning"><Info size={15}/><span><b>Current total is provisional.</b> Add a room rate for {currentCosts.missingHotelRates.join(', ')} to complete the quote. The current calculated amount remains visible in the PDF.</span></div>}<button className="primary-cta inline" type="button" onClick={download} disabled={downloading}><Download size={17}/>{downloading?'Preparing PDF…':'Download client PDF'}</button></section>
    <section className="pdf-preview"><div className="section-head"><div><span className="eyebrow">DOCUMENT CONTENT</span><h2>Review this itinerary</h2><p>These values are pulled from the live planner. The fixed pages use the same artwork for every customer.</p></div></div><div className="pdf-review-grid"><div className="pdf-review-cover"><img src={ART.cover} alt="Discover Kashmir cover artwork"/><span className="pdf-preview-logo"><span className="original-logo" role="img" aria-label="Chakar Experience"/></span><span>Dear {customerName},</span></div><div className="pdf-review-details"><div><small>Tour summary</small><b>{currentPlan.nights} nights / {currentPlan.days} days</b><span>{date(input.arrival)} – {date(input.departure)}</span><span>{input.pickup} pick-up · {input.adults} adults · {input.youngAges.length} {input.youngAges.length===1?'child':'children'}</span></div><div><small>Package type</small><b>{input.hotelCategory} · {uiMoney(currentCosts.sellingTotal)}</b><span>{input.transport} · {input.mealPlan} · {roomSummary(hotels)}</span></div><div><small>Hotel type</small>{hotels.map((hotel)=><span key={hotel.location}>{hotel.location} {hotel.nights}N (nights {hotel.nightNumbers.join(', ')}) · {hotel.hotelName}</span>)}</div></div></div><div className="pdf-review-days"><h3>Day-wise itinerary</h3>{currentPlan.dayPlans.map((day)=><div key={day.day}><b>Day {day.day} · {date(day.date,true)} · {dayTitle(day,input.pickup)}</b><p>{dayNarrative(day,input.pickup)}</p></div>)}</div><div className="pdf-fixed-pages"><b>Fixed pages in every PDF</b><span>Cover letter</span><span>Inclusions</span><span>Exclusions</span><span>Policies</span><span>Testimonials</span><span>Thank you</span></div></section>
    <div className="next-row"><Link className="secondary-link" href="/planner/costing"><ChevronLeft size={16}/> Back to costing</Link><div className="pdf-next-actions"><Link className="secondary-link" href="/saved-itineraries"><FolderOpen size={16}/> Saved Itineraries</Link><button className="primary-cta inline" type="button" onClick={reset}>Build New</button></div></div>
  </PlannerChrome>;
}
