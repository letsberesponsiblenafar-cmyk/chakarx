import { destinationByName, type Destination } from '@/lib/data';
import type { DayPlan } from '@/lib/itinerary';

// Route language follows the supplied Chakar itinerary playbook and sample packages.
// Client copy is composed from the operator's selected route and destination guide.
const corridors: Record<string,string> = {
  'Srinagar|Gulmarg': 'through Tangmarg and the foothills of the Pir Panjal',
  'Gulmarg|Srinagar': 'back through Tangmarg to the Kashmir Valley',
  'Srinagar|Pahalgam': 'through South Kashmir, the saffron and orchard belt, and the Lidder Valley',
  'Pahalgam|Srinagar': 'along the Lidder Valley and South Kashmir countryside',
  'Srinagar|Sonamarg': 'along the Sindh River corridor via Kangan',
  'Sonamarg|Srinagar': 'back along the Sindh River corridor',
  'Srinagar|Gurez': 'via Bandipora and Razdan Pass towards Dawar and the Kishanganga River',
  'Gurez|Srinagar': 'over Razdan Pass and through Bandipora',
  'Srinagar|Doodhpathri': 'through the Budgam countryside towards the Shaliganga River meadows',
  'Doodhpathri|Srinagar': 'through the Budgam countryside',
  'Srinagar|Naranag': 'through the Sindh Valley towards the Wangath and Naranag heritage area',
  'Naranag|Srinagar': 'back through the Sindh Valley',
};
const destinationStory: Record<string,string> = {
  Srinagar: 'Spend time around Dal Lake, the Boulevard, Mughal gardens and the Zabarwan foothills at a comfortable pace.',
  Gulmarg: 'Enjoy Gulmarg’s alpine meadows and sweeping views of the Pir Panjal mountains.',
  Pahalgam: 'Follow the Lidder River through Pahalgam’s pine-lined valley and enjoy its mountain scenery.',
  Sonamarg: 'Enjoy the Sindh River and the mountain scenery around Sonamarg.',
  Doodhpathri: 'Explore the meadows and Shaliganga River area without rushing the day.',
  Naranag: 'Discover the ancient Naranag temple remains and the scenery of Wangath Valley.',
  Gurez: 'Explore Dawar, the Kishanganga River and the traditional wooden-village landscape.',
};
export function defaultDayNote(destination: Destination) {
  return destinationStory[destination.name] || destination.description || `Enjoy ${destination.name} at a comfortable pace.`;
}

export function dayTitle(day: DayPlan, pickup: string) {
  if (day.customTitle?.trim()) return day.customTitle.trim();
  if (day.day === 1) return day.dayTripDestination
    ? `Arrival in ${pickup} & ${day.dayTripDestination} day visit`
    : day.stay.toLowerCase() === pickup.toLowerCase()
    ? `Arrival in ${day.stay} & ${day.stay === 'Srinagar' ? 'local sightseeing' : 'sightseeing'}`
    : `Arrival in ${pickup} & transfer to ${day.stay}`;
  if (day.label === 'Departure day') return `Departure from ${day.to}`;
  if (day.dayTripDestination) return `${day.dayTripDestination} day visit · overnight in ${day.stay}`;
  if (day.transfer) return `${day.from} to ${day.stay}`;
  const excursion = day.blocks.find((block) => block.name.toLowerCase().includes('day trip'));
  return excursion ? `${excursion.name} from ${day.stay}` : `${day.stay}${day.stay === 'Srinagar' ? ' local' : ''} sightseeing`;
}

export function dayNarrative(day: DayPlan, pickup: string) {
  if (day.customAbout?.trim()) return day.customAbout.trim();
  if (day.label === 'Departure day') {
    return day.stay === day.to
      ? `After breakfast, check out from your ${day.stay} hotel and travel to the selected departure terminal in ${day.to}. Keep the sightseeing window flexible around the reporting time. Your driver will assist with the final transfer.`
      : `After breakfast, check out from ${day.stay} and travel to ${day.to} for departure. Your driver will assist with the final transfer to the selected terminal.`;
  }

  const excursion = day.blocks.find((block) => block.name.toLowerCase().endsWith('day trip'));
  const destination = day.dayTripDestination || excursion?.name.replace(/ day trip$/i,'') || day.stay;
  const guide = destinationByName(destination);
  const story = guide?.day_note?.trim() || (guide ? defaultDayNote(guide) : `Enjoy ${destination} at a comfortable pace.`);
  const route = corridors[`${day.from}|${day.stay}`] || (day.drive.via?.length ? `via ${day.drive.via.join(' and ')}` : 'along the planned Kashmir route');
  let opening: string;
  if (day.day === 1 && excursion) opening = `On arrival at ${pickup}, meet your driver and enjoy a visit to ${destination} before returning to your ${day.stay} hotel for the night. `;
  else if (day.day === 1) opening = day.stay.toLowerCase() === pickup.toLowerCase()
    ? `Arrive at ${pickup}, meet your driver and transfer to the hotel for check-in. Settle in before heading out. `
    : `Arrive at ${pickup}, meet your driver and travel to ${day.stay} ${route}. Check in on arrival. `;
  else if (excursion && day.transfer) opening = `After breakfast, check out from ${day.from}, visit ${destination} during the day, then continue to ${day.stay} for check-in and overnight. `;
  else if (excursion) opening = `After breakfast, leave ${day.stay} for a day excursion to ${destination}; return to the same hotel by evening. `;
  else if (day.transfer) opening = `After breakfast, check out from ${day.from} and drive to ${day.stay} ${route}. Check in before exploring the local area. `;
  else opening = `After breakfast, enjoy a full day around ${day.stay} without changing hotels. `;

  const stops = excursion ? [] : day.blocks.filter((block) => block.kind !== 'arrival' && block.kind !== 'departure' && !['EXTRA','EXCLUDED','OPTIONAL'].includes(block.intelligence?.status || '')).slice(0,2).map((block) => block.name);
  const stopText = stops.length ? ` Planned stops include ${stops.join(' and ')}.` : '';
  const things = guide?.enabled_things_to_do ?? [];
  const activities = guide?.enabled_activities ?? [];
  const experiences = [...new Set([...things, ...activities])];
  const experienceText = experiences.length ? ` Experiences on this day include ${experiences.join(', ')}.` : '';
  return `${opening}${story}${stopText}${experienceText} Overnight in ${day.stay}.`;
}
