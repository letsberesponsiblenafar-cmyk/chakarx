import type { Hotel } from '@/lib/data';

const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function boundaries(value: string): [string, string] | null {
  const text = value.trim().toLowerCase();
  const dates = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  if (dates.length >= 2) return [dates[0], dates[1]];
  if (dates.length === 1) return [dates[0], dates[0]];
  const found = Object.entries(months).find(([name]) => text.includes(name) || text.includes(name.slice(0, 3)));
  const year = text.match(/\b20\d{2}\b/)?.[0];
  if (!found || !year) return null;
  const month = String(found[1]).padStart(2, '0');
  const end = new Date(Date.UTC(Number(year), found[1], 0)).getUTCDate();
  return [`${year}-${month}-01`, `${year}-${month}-${String(end).padStart(2, '0')}`];
}

export function hotelRateValidity(hotel: Pick<Hotel, 'rateValidity'>, arrival?: string, departure?: string): 'matching' | 'outside' | 'unverified' {
  if (!arrival || !departure) return 'unverified';
  const range = boundaries(hotel.rateValidity || '');
  if (!range) return 'unverified';
  const lastNight = new Date(`${departure}T12:00:00`);
  lastNight.setDate(lastNight.getDate() - 1);
  const lastDate = lastNight.toISOString().slice(0, 10);
  return arrival >= range[0] && lastDate <= range[1] ? 'matching' : 'outside';
}

export function stayDateWindow(days: Array<{ date: string; stay: string }>, destination: string) {
  const dates = days.filter((day) => day.stay === destination).map((day) => day.date).sort();
  if (!dates.length) return { arrival: '', departure: '' };
  const final = new Date(`${dates[dates.length - 1]}T12:00:00`);
  final.setDate(final.getDate() + 1);
  return { arrival: dates[0], departure: final.toISOString().slice(0, 10) };
}
