import { destinationByName } from '@/lib/data';
import type { DayPlan } from '@/lib/itinerary';

// Route language follows the supplied Chakar itinerary playbook and sample packages.
// These are descriptive corridors, not promises about live road access or timing.
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
};
const destinationStory: Record<string,string> = {
  Srinagar: 'Spend time around Dal Lake, the Boulevard, Mughal gardens and the Zabarwan foothills at a comfortable pace.',
  Gulmarg: 'The meadow opens towards the Pir Panjal mountains. Enjoy the alpine setting; the Gondola and pony activities remain optional and subject to local operations.',
  Pahalgam: 'Follow the Lidder River setting and pine-lined valley. Aru, Betaab Valley and Chandanwari depend on the available local transport and conditions.',
  Sonamarg: 'Enjoy the Sindh River and mountain scenery around Sonamarg. Thajiwas and higher viewpoints depend on weather and local vehicle access.',
  Doodhpathri: 'Explore the meadows and Shaliganga River area without rushing the day.',
  Gurez: 'Explore Dawar, the Kishanganga River and the wooden-village landscape. Razdan Pass and onward routes need a live road check.',
};

export function dayTitle(day: DayPlan, pickup: string) {
  if (day.customTitle?.trim()) return day.customTitle.trim();
  if (day.day === 1) return day.stay.toLowerCase() === pickup.toLowerCase()
    ? `Arrival in ${day.stay} & local sightseeing`
    : `Arrival in ${pickup} & transfer to ${day.stay}`;
  if (day.label === 'Departure day') return `Departure from ${day.to}`;
  if (day.dayTripDestination) return `${day.dayTripDestination} day visit · overnight in ${day.stay}`;
  if (day.transfer) return `${day.from} to ${day.stay}`;
  const excursion = day.blocks.find((block) => block.name.toLowerCase().includes('day trip'));
  return excursion ? `${excursion.name} from ${day.stay}` : `${day.stay} local sightseeing`;
}

export function dayNarrative(day: DayPlan, pickup: string) {
  if (day.customAbout?.trim()) return day.customAbout.trim();
  if (day.label === 'Departure day') {
    return day.stay === day.to
      ? `After breakfast, check out from your ${day.stay} hotel and travel to the selected departure terminal in ${day.to}. Keep the sightseeing window flexible around the reporting time. Your driver will assist with the final transfer.`
      : `After breakfast, check out from ${day.stay} and travel to ${day.to} for departure. Allow for the ${day.drive.hours ? `approximately ${day.drive.hours.toFixed(1)}-hour ` : ''}road journey, traffic and terminal reporting time; choose a Srinagar overnight on the previous day when the departure is early. Your driver will assist with the final transfer.`;
  }

  const excursion = day.blocks.find((block) => block.name.toLowerCase().endsWith('day trip'));
  const destination = day.dayTripDestination || excursion?.name.replace(/ day trip$/i,'') || day.stay;
  const story = destinationStory[destination] || destinationByName(destination)?.description || `Enjoy ${destination} at a relaxed pace.`;
  const route = corridors[`${day.from}|${day.stay}`] || (day.drive.via?.length ? `via ${day.drive.via.join(' and ')}` : 'along the planned Kashmir route');
  let opening: string;
  if (day.day === 1) opening = day.stay.toLowerCase() === pickup.toLowerCase()
    ? `Arrive at ${pickup}, meet your driver and transfer to the hotel for check-in. Settle in before heading out. `
    : `Arrive at ${pickup}, meet your driver and travel to ${day.stay} ${route}. Check in on arrival. `;
  else if (excursion && day.transfer) opening = `After breakfast, check out from ${day.from}, visit ${destination} during the day, then continue to ${day.stay} for check-in and overnight. Confirm the travel time against the arrival and sightseeing schedule. `;
  else if (excursion) opening = `After breakfast, leave ${day.stay} for a day excursion to ${destination}; return to the same hotel by evening. `;
  else if (day.transfer) opening = `After breakfast, check out from ${day.from} and drive to ${day.stay} ${route}. Check in before exploring the local area. `;
  else opening = `After breakfast, enjoy a full day around ${day.stay} without changing hotels. `;

  const stops = day.blocks.filter((block) => block.kind !== 'arrival' && block.kind !== 'departure' && block !== excursion && !['EXTRA','EXCLUDED','OPTIONAL'].includes(block.intelligence?.status || '')).slice(0,2).map((block) => block.name);
  const stopText = stops.length ? ` Planned stops include ${stops.join(' and ')}.` : '';
  const conditional = day.drive.live_required || day.blocks.some((block) => ['CONDITIONAL','LIVE_CHECK','SEASONAL'].includes(block.intelligence?.status || ''))
    ? ' Confirm road access, weather and locally operated activities before travel.' : '';
  return `${opening}${story}${stopText}${conditional} Overnight in ${day.stay}.`;
}
