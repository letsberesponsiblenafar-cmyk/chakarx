import { jsPDF } from 'jspdf';
import type { CostModel, HotelSelection } from '@/components/PlannerProvider';
import type { Plan, TripInput } from '@/lib/itinerary';
import type { ActivityLists, ClientPdfPackageQuote, Costs, PdfFonts } from '@/lib/pdf-types';
import { pdfHotels, pdfHotelLocation, pdfHotelName } from '@/lib/pdf-content';
import { accommodationDayNarrative, hotelForNight, hotelSelectionKey, hotelStayLabel, hotelStayType } from '@/lib/accommodation';
import { dayTitle } from '@/lib/narrative';
import { withPlanDestinations } from '@/lib/plan-destinations';
import { winterStaticCopy } from '@/lib/winter-static-copy';

export type WinterPdfArt = { cover: string; brandWhite?: string; brandInk?: string };
type Color = [number, number, number];
const W = 540, H = 780, M = 38, WIDTH = W - M * 2, BOTTOM = 710;
const INK: Color = [22, 44, 61], MUTED: Color = [78, 101, 116], ICE: Color = [232, 241, 245];
const SNOW: Color = [250, 252, 253], LINE: Color = [207, 221, 228], GOLD: Color = [151, 119, 62], WHITE: Color = [255, 255, 255];

function printable(value: unknown) {
  return String(value ?? '').trim().replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014\u2011]/g, '-').replace(/→/g, 'to').replace(/≤/g, '<=');
}
function date(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function money(value: number) { return `Rs. ${Math.round(value).toLocaleString('en-IN')}/-`; }
function rooms(hotels: HotelSelection[]) {
  const counts = [...new Set(hotels.map((hotel) => hotel.rooms))].sort((a, b) => a - b);
  const beds = Math.max(0, ...hotels.map((hotel) => hotel.extraBeds));
  return `${counts.length < 2 ? `${counts[0] || 1} room${counts[0] === 1 ? '' : 's'}` : `${counts[0]}-${counts.at(-1)} rooms by stay`}${beds ? `, ${beds} extra bed${beds === 1 ? '' : 's'}` : ''}`;
}

/** Text is always emitted as embedded-font PDF text. Only the landscape is raster art. */
class WinterLayout {
  y = 158;
  title = '';
  chapter = '';
  constructor(readonly doc: jsPDF, readonly art: WinterPdfArt) {}

  font(size = 10.5, bold = false, color: Color = INK) {
    this.doc.setFont('evolventa', bold ? 'bold' : 'normal'); this.doc.setFontSize(size); this.doc.setTextColor(...color);
  }
  lines(value: string, width = WIDTH, size = 10.5, bold = false): string[] {
    this.font(size, bold); return this.doc.splitTextToSize(printable(value), width) as string[];
  }
  image(value: string, x: number, y: number, width: number, height: number, alias: string) {
    const properties = this.doc.getImageProperties(value);
    const scale = Math.max(width / properties.width, height / properties.height);
    const imageWidth = properties.width * scale, imageHeight = properties.height * scale;
    this.doc.saveGraphicsState();
    // Defer painting the rectangle so the path still exists when clipping.
    this.doc.rect(x, y, width, height, null); this.doc.clip(); this.doc.discardPath();
    this.doc.addImage(value, properties.fileType, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight, alias, 'NONE');
    this.doc.restoreGraphicsState();
  }
  page(title = this.title, chapter = this.chapter, continued = false) {
    this.doc.addPage(); this.title = title; this.chapter = chapter;
    this.doc.setFillColor(...SNOW); this.doc.rect(0, 0, W, H, 'F');
    if (this.art.brandInk) this.doc.addImage(this.art.brandInk, 'PNG', M - 3, 20, 112, 112 * 223 / 593, 'winter-brand-ink', 'NONE');
    else { this.font(12, true); this.doc.text('CHAKAR EXPERIENCE', M, 44); }
    this.font(7.5, true, MUTED); this.doc.text('WINTER EDITION', W - M, 43, { align: 'right' });
    this.doc.setDrawColor(...LINE); this.doc.setLineWidth(0.6); this.doc.line(M, 72, W - M, 72);
    this.font(8, true, GOLD); this.doc.text(chapter.toUpperCase(), M, 99);
    this.font(27, false, INK); this.doc.setFont('redhat', 'normal');
    this.doc.text(title, M, 133);
    if (continued) { this.font(8, false, MUTED); this.doc.text('CONTINUED', W - M, 99, { align: 'right' }); }
    this.y = 160;
  }
  ensure(height: number) {
    if (this.y + height > BOTTOM) this.page(this.title, this.chapter, true);
  }
  paragraph(value: string, options: { size?: number; bold?: boolean; color?: Color; gap?: number; x?: number; width?: number; lineHeight?: number } = {}) {
    const size = options.size ?? 10.5, x = options.x ?? M, width = options.width ?? WIDTH;
    const lineHeight = options.lineHeight ?? size * 1.55;
    const lines = this.lines(value, width, size, options.bold);
    for (const line of lines) {
      this.ensure(lineHeight);
      this.font(size, options.bold, options.color ?? INK); this.doc.text(line, x, this.y + size);
      this.y += lineHeight;
    }
    this.y += options.gap ?? 12;
  }
  heading(value: string) {
    const height = this.lines(value, WIDTH, 12, true).length * 16 + 36;
    this.ensure(Math.min(height, BOTTOM - 160));
    this.paragraph(value, { size: 12, bold: true, gap: 9, lineHeight: 16 });
  }
  rule() {
    // A decorative divider must never create a mostly empty continuation page.
    if (this.y + 16 > BOTTOM) { this.y = BOTTOM; return; }
    this.doc.setDrawColor(...LINE); this.doc.line(M, this.y, W - M, this.y); this.y += 18;
  }
  list(items: readonly string[]) {
    const seen = new Set<string>();
    for (const item of items) {
      const identity = item.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!identity || seen.has(identity)) continue;
      seen.add(identity); this.ensure(28);
      this.doc.setFillColor(...GOLD); this.doc.circle(M + 2.5, this.y + 7, 2, 'F');
      this.paragraph(item, { x: M + 16, width: WIDTH - 16, gap: 13 });
    }
  }

  /** Rows, including a single oversized cell, continue without dropping any lines. */
  table(headers: string[], widths: number[], rows: string[][], emphasizedRows: number[] = []) {
    const size = 9.6, lineHeight = 14.5, pad = 11;
    const header = () => {
      const labels = headers.map((value, i) => this.lines(value, widths[i] - pad * 2, size, true));
      const height = Math.max(...labels.map((lines) => lines.length)) * lineHeight + pad * 2;
      this.ensure(height + 50);
      let x = M;
      labels.forEach((lines, i) => {
        this.doc.setFillColor(...INK); this.doc.rect(x, this.y, widths[i], height, 'F');
        this.font(size, true, WHITE); this.doc.text(lines, x + pad, this.y + pad + size, { lineHeightFactor: lineHeight / size });
        x += widths[i];
      });
      this.y += height;
    };
    header();
    rows.forEach((values, rowIndex) => {
      const bold = emphasizedRows.includes(rowIndex);
      const cells = values.map((value, i) => this.lines(value, widths[i] - pad * 2, size, bold));
      const offsets = cells.map(() => 0);
      let more = true;
      while (more) {
        const needed = Math.max(...cells.map((lines, i) => lines.length - offsets[i])) * lineHeight + pad * 2;
        // Keep ordinary rows intact; only genuinely oversized rows split.
        if (this.y + needed > BOTTOM && needed <= BOTTOM - 160 - 52) {
          this.page(this.title, this.chapter, true); header();
        }
        let available = Math.floor((BOTTOM - this.y - pad * 2) / lineHeight);
        if (available < 1) {
          this.page(this.title, this.chapter, true); header();
          available = Math.floor((BOTTOM - this.y - pad * 2) / lineHeight);
        }
        const count = Math.min(available, Math.max(...cells.map((lines, i) => lines.length - offsets[i])));
        const height = count * lineHeight + pad * 2;
        let x = M;
        cells.forEach((lines, i) => {
          const visible = lines.slice(offsets[i], offsets[i] + count);
          this.doc.setFillColor(...(bold ? ICE : rowIndex % 2 === 0 ? WHITE : [242, 247, 249]) as Color);
          this.doc.rect(x, this.y, widths[i], height, 'F');
          this.doc.setDrawColor(...LINE); this.doc.setLineWidth(0.35); this.doc.rect(x, this.y, widths[i], height);
          this.font(size, bold, INK);
          if (visible.length) this.doc.text(visible, x + pad, this.y + pad + size, { lineHeightFactor: lineHeight / size });
          offsets[i] += visible.length; x += widths[i];
        });
        this.y += height;
        more = cells.some((lines, i) => offsets[i] < lines.length);
        if (more) { this.page(this.title, this.chapter, true); header(); }
      }
    });
    this.y += 20;
  }
  finish() {
    const pages = this.doc.getNumberOfPages();
    for (let page = 2; page <= pages; page++) {
      this.doc.setPage(page); this.doc.setDrawColor(...LINE); this.doc.setLineWidth(0.5); this.doc.line(M, 737, W - M, 737);
      this.font(7.5, false, MUTED); this.doc.text('CHAKAR EXPERIENCE  /  www.chakar.world', M, 754);
      this.doc.text(`${String(page).padStart(2, '0')} / ${String(pages).padStart(2, '0')}`, W - M, 754, { align: 'right' });
    }
  }
}

function addCover(layout: WinterLayout, plan: Plan, input: TripInput) {
  const { doc, art } = layout;
  layout.image(art.cover, 0, 0, W, H, 'winter-landscape');
  // Solid panels retain contrast regardless of the landscape or print profile.
  doc.setFillColor(...INK); doc.rect(0, 510, W, 270, 'F');
  doc.setFillColor(...SNOW); doc.rect(M - 10, 22, 145, 61, 'F');
  if (art.brandInk) doc.addImage(art.brandInk, 'PNG', M, 28, 125, 125 * 223 / 593, 'winter-brand-ink', 'NONE');
  else { layout.font(11, true); doc.text('CHAKAR EXPERIENCE', M, 55); }
  layout.font(9, true, [220, 199, 159]); doc.text('WINTER EDITION', M, 550);
  doc.setFont('redhat', 'normal'); doc.setFontSize(52); doc.setTextColor(...WHITE); doc.text('Kashmir', M - 2, 615);
  layout.font(17, false, WHITE); doc.text('Your journey, thoughtfully planned.', M, 645);
  doc.setDrawColor(79, 103, 118); doc.line(M, 674, W - M, 674);
  layout.font(10.5, true, WHITE); doc.text(`${plan.nights} NIGHTS / ${plan.days} DAYS`, M, 703);
  layout.font(10.5, false, WHITE); doc.text(`${date(input.arrival)} - ${date(input.departure)}`, M, 726);
  layout.font(7.5, false, [184, 205, 215]); doc.text('CHAKAR EXPERIENCE', M, 757);
}

function addSummary(layout: WinterLayout, plan: Plan, input: TripInput, customerName: string) {
  layout.page('Your journey', '01 / At a glance');
  layout.paragraph(`Prepared for ${customerName}`, { size: 17, bold: true, gap: 23 });
  layout.table(['Your trip', 'Details'], [149, WIDTH - 149], [
    ['Duration', `${plan.nights} Nights / ${plan.days} Days`],
    ['Arrival', date(input.arrival)], ['Departure', date(input.departure)],
    ['Pickup point', input.pickup || 'Pick-up to confirm'],
    ['Travellers', `${input.adults} adult${input.adults === 1 ? '' : 's'}${input.youngAges.length ? ` plus ${input.youngAges.length} child${input.youngAges.length === 1 ? '' : 'ren'} (${input.youngAges.join(', ')} yrs)` : ''}`],
  ]);
}

function addDays(layout: WinterLayout, plan: Plan, input: TripInput, selections: HotelSelection[], quote?: CostModel) {
  layout.page('Day by day', '03 / Your itinerary');
  for (const day of plan.dayPlans) {
    const title = withPlanDestinations(plan, () => dayTitle(day, input.pickup));
    const overnight = hotelForNight(plan, selections, day.day);
    const label = day.label === 'Departure day' ? `Departure: ${day.to} (previous night: ${day.stay})` : `Overnight: ${overnight ? hotelStayLabel(overnight) : day.stay}`;
    const story = accommodationDayNarrative(plan, selections, day, input.pickup, quote);
    const dayHeight = 8.5 * 1.55 + 6 + layout.lines(title, WIDTH, 12, true).length * 16 + 9
      + layout.lines(label, WIDTH, 9.2, true).length * 9.2 * 1.55 + 8
      + layout.lines(story).length * 10.5 * 1.55 + 17 + 18;
    // Normal days stay together. Exceptionally long manual narratives may flow.
    layout.ensure(dayHeight <= BOTTOM - 160 ? dayHeight : 95);
    layout.paragraph(`DAY ${String(day.day).padStart(2, '0')}  /  ${date(day.date)}`, { size: 8.5, bold: true, color: GOLD, gap: 6 });
    layout.heading(title);
    layout.paragraph(label, { size: 9.2, color: MUTED, bold: true, gap: 8 });
    layout.paragraph(story, { gap: 17 });
    layout.rule();
  }
}

function addInvestments(layout: WinterLayout, quotes: readonly ClientPdfPackageQuote[]) {
  for (let start = 0; start < quotes.length; start += 3) {
    const group = quotes.slice(start, start + 3), labelWidth = group.length > 1 ? 112 : 149;
    const widths = [labelWidth, ...group.map(() => (WIDTH - labelWidth) / group.length)];
    const headers = ['Package details', ...group.map((_, index) => quotes.length > 1 ? `Option ${String(start + index + 1).padStart(2, '0')}` : 'Your package')];
    layout.page('Trip investments', '04 / Your package');
    layout.paragraph(`${group[0].plan.nights} Nights / ${group[0].plan.days} Days`, { size: 11, color: MUTED, gap: 20 });
    layout.table(headers, widths, [
      ['Package', ...group.map((item) => item.category)],
      ['Total Investment', ...group.map((item) => money(item.costs.sellingTotal))],
      ['Transport', ...group.map((item) => item.input.transport)],
      ['Meal Plan', ...group.map((item) => item.input.mealPlan)],
      ['Number of Rooms', ...group.map((item) => rooms(pdfHotels(item.plan, item.selections, item.input)))],
    ], [1]);
  }
}

function addHotels(layout: WinterLayout, quotes: readonly ClientPdfPackageQuote[]) {
  for (let start = 0; start < quotes.length; start += 3) {
    const group = quotes.slice(start, start + 3);
    const columns = group.map((item) => pdfHotels(item.plan, item.selections, item.input));
    const keys = [...new Set(columns.flatMap((hotels) => hotels.map(hotelSelectionKey)))];
    const labelWidth = group.length > 1 ? 112 : 149;
    const widths = [labelWidth, ...group.map(() => (WIDTH - labelWidth) / group.length)];
    const headers = ['Destination', ...group.map((_, index) => quotes.length > 1 ? `Option ${String(start + index + 1).padStart(2, '0')}` : 'Hotel / Houseboat')];
    layout.page('Your stays', '05 / Accommodation');
    const rows = [['Package', ...group.map((item) => item.category)]];
    for (const key of keys) {
      const hotels = columns.map((entries) => entries.find((hotel) => hotelSelectionKey(hotel) === key));
      const first = hotels.find((hotel) => Boolean(hotel))!;
      const nights = [...new Set(hotels.filter((hotel): hotel is HotelSelection => Boolean(hotel)).map((hotel) => hotel.nights))];
      rows.push([
        `${pdfHotelLocation(columns.flat(), first)}\n${nights.length === 1 ? `${nights[0]} night${nights[0] === 1 ? '' : 's'}` : 'Nights by package'}`,
        ...hotels.map((hotel, index) => hotel ? `${pdfHotelName(hotel, group[index].input)}${nights.length > 1 ? `\n${hotel.nights} night${hotel.nights === 1 ? '' : 's'}` : ''}` : 'Not included'),
      ]);
    }
    layout.table(headers, widths, rows);
  }
}

/** A separate presentation renderer; routing, references and prices remain upstream. */
export function buildWinterClientPdf(art: WinterPdfArt, plan: Plan, input: TripInput, selections: HotelSelection[], costs: Costs,
  customerName: string, fonts: PdfFonts, activityLists: ActivityLists = { included: [], excluded: [] }, quote?: CostModel,
  comparison: readonly ClientPdfPackageQuote[] = []) {
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: 'portrait', compress: true });
  doc.addFileToVFS('Evolventa-Regular.ttf', fonts.regular); doc.addFileToVFS('Evolventa-Bold.ttf', fonts.bold); doc.addFileToVFS('RedHatDisplay-400.ttf', fonts.cover);
  doc.addFont('Evolventa-Regular.ttf', 'evolventa', 'normal'); doc.addFont('Evolventa-Bold.ttf', 'evolventa', 'bold'); doc.addFont('RedHatDisplay-400.ttf', 'redhat', 'normal');
  doc.setProperties({ title: `${printable(customerName)} - Kashmir itinerary`, subject: 'Chakar Experience / Winter edition v1', author: 'Chakar Experience', creator: 'ChakarX' });
  const layout = new WinterLayout(doc, art);
  const hotels = pdfHotels(plan, selections, input);
  const quotes = comparison.length > 1 ? comparison : [{ category: input.hotelCategory, plan, input, selections, costs, quote }];
  addCover(layout, plan, input);
  addSummary(layout, plan, input, customerName);
  layout.page('A warm welcome', '02 / Chakar Experience');
  layout.paragraph(`Dear ${customerName},`, { bold: true, gap: 16 });
  winterStaticCopy.letter.forEach((paragraph, index) => layout.paragraph(paragraph, { size: index ? 10.2 : 12, bold: !index, gap: 13 }));
  layout.paragraph('Regards,\nRaqeeb Sofi\nCEO\nChakar Experience', { size: 10.2, gap: 0 });
  addDays(layout, plan, input, selections, quote);
  addInvestments(layout, quotes); addHotels(layout, quotes);
  layout.page('Included in your stay', '06 / Package inclusions');
  layout.list([
    `Accommodation at the listed ${hotels.some((hotel) => hotelStayType(hotel) === 'houseboat') ? (hotels.some((hotel) => hotelStayType(hotel) === 'hotel') ? 'hotels and houseboats' : 'houseboats') : 'hotels'} for ${plan.nights} night${plan.nights === 1 ? '' : 's'}.`,
    comparison.length > 1 ? 'Private transport for the itinerary, including sightseeing and transfers. Package vehicle options are listed in Trip Investments.' : `${input.transport} private transport for the itinerary, including sightseeing and transfers.`,
    input.mealPlan === 'None' ? '' : `${input.mealPlan} at the selected accommodation.`, 'Road tolls and applicable vehicle charges.',
    ...activityLists.included.map((item) => /[.!?]$/.test(item) ? item : `${item}.`),
  ]);
  layout.paragraph('*Terms and Conditions Apply', { size: 8, color: MUTED });
  if (activityLists.excluded.some((item) => item.trim())) {
    layout.page('Not included', '07 / Package exclusions'); layout.list(activityLists.excluded);
    layout.paragraph('*Terms and Conditions Apply', { size: 8, color: MUTED });
  }
  layout.page('Booking policies', '08 / Important information');
  for (const section of winterStaticCopy.policies) {
    layout.heading(section.title);
    section.paragraphs.forEach((paragraph) => layout.paragraph(paragraph, { size: 10, lineHeight: 15, gap: 7 }));
    layout.y += 3;
  }
  layout.paragraph('*Terms and Conditions Apply', { size: 8, color: MUTED });
  layout.page('Words from our guests', '09 / Client testimonials');
  for (const item of winterStaticCopy.testimonials) {
    layout.ensure(85); layout.heading(item.name); layout.paragraph(item.quote, { size: 10.2, color: MUTED, gap: 10 }); layout.rule();
  }
  layout.paragraph("Watch some of our reviews here: Video Review's or go to https://www.instagram.com/chakar.world", { size: 9.4 });
  layout.page('Thanks for choosing us', '10 / Until we meet in Kashmir');
  layout.image(art.cover, M, 163, WIDTH, 236, 'winter-landscape'); layout.y = 425;
  layout.heading('Chakar Experience');
  winterStaticCopy.contacts.forEach((item) => layout.paragraph(item, { size: 10.5, gap: 6 }));
  layout.y += 10; layout.rule();
  layout.paragraph(winterStaticCopy.registration, { size: 8.5, color: MUTED, gap: 8 });
  layout.paragraph(winterStaticCopy.companyId, { size: 8.5, color: MUTED, gap: 0 });
  layout.finish();
  return doc;
}
