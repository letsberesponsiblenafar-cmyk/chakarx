import { destinationByName } from '@/lib/data';
import type { DayPlan } from '@/lib/itinerary';

// Condensed from the supplied Chakar master itinerary and route playbook.
const destinationStory: Record<string, string> = {
  Srinagar: 'Explore the Mughal gardens, historic landmarks and lakefront views around Dal Lake and the Zabarwan mountains.',
  Gulmarg: 'Travel through villages and orchards toward the Pir Panjal, then enjoy Gulmarg Meadows and its alpine scenery.',
  Pahalgam: 'Follow the South Kashmir route through orchards toward the Lidder Valley, with its pine forests, river scenery and mountain views.',
  Sonamarg: 'Follow the Sindh River corridor through villages and forests to Sonamarg Meadows beneath the Himalayan peaks.',
  Doodhpathri: 'Travel through the Budgam countryside to quiet meadows, the Shaliganga River and accessible viewpoints.',
  Gurez: 'Journey through Bandipora and Razdan Pass to Dawar, the Kishanganga River and the mountain landscapes of Gurez.',
};
const localStory: Record<string, string> = {
  Srinagar: 'Explore the garden circuit, lakefront and historic viewpoints around Dal Lake.',
  Gulmarg: 'Spend time in Gulmarg Meadows and the surrounding alpine landscape.',
  Pahalgam: 'Explore the Lidder River setting, valley scenery and accessible local viewpoints.',
  Sonamarg: 'Explore Sonamarg Meadows and the Sindh River landscape beneath the Himalayan peaks.',
  Doodhpathri: 'Enjoy the Doodhpathri Meadows, Shaliganga River and nearby accessible viewpoints.',
  Gurez: 'Explore Dawar, the Kishanganga River and the mountain scenery of Gurez.',
};

export function dayTitle(day: DayPlan, pickup: string) {
  if (day.customTitle?.trim()) return day.customTitle.trim();
  if (day.day === 1) return day.stay.toLowerCase() === pickup.toLowerCase()
    ? `Arrival in ${day.stay} & local sightseeing`
    : `Arrival in ${pickup} & ${day.stay} local sightseeing`;
  if (day.label === 'Departure day') return `Departure from ${day.stay}`;
  return day.stay;
}

export function dayNarrative(day: DayPlan, pickup: string) {
  if (day.customAbout?.trim()) return day.customAbout.trim();
  const destination = destinationByName(day.stay);
  const story = (day.transfer ? destinationStory[day.stay] : localStory[day.stay]) || destination?.description || `Explore ${day.stay} at a comfortable pace.`;
  const arrival = day.day === 1
    ? pickup.toLowerCase() === day.stay.toLowerCase()
      ? `Arrive in ${day.stay} and settle in before sightseeing. `
      : `Arrive at ${pickup || 'the selected pickup point'} and proceed to ${day.stay}. Settle in before sightseeing. `
    : day.label === 'Departure day'
      ? `After breakfast, check out from ${day.stay} and plan the onward transfer around your departure time. `
      : day.transfer
        ? `After breakfast, check out and travel from ${day.from} to ${day.stay}. `
        : `After breakfast, enjoy a day around ${day.stay}. `;
  const included = day.blocks.filter((block) =>
    block.kind !== 'arrival' && block.kind !== 'departure' &&
    !['EXTRA', 'EXCLUDED', 'OPTIONAL'].includes(block.intelligence?.status || '')
  ).slice(0, 3).map((block) => block.name);
  const stops = day.label === 'Departure day' ? '' : included.length ? ` Planned sightseeing includes ${included.join(', ')}.` : '';
  const conditional = day.blocks.some((block) => ['CONDITIONAL', 'LIVE_CHECK', 'SEASONAL'].includes(block.intelligence?.status || ''))
    ? ' Weather, access and local operations must be checked before confirming conditional stops.' : '';
  const overnight = day.label === 'Departure day' ? '' : ` Overnight stay in ${day.stay}.`;
  return `${arrival}${day.label === 'Departure day' ? 'Keep any final sightseeing flexible around your departure schedule.' : story}${stops}${conditional}${overnight}`;
}
