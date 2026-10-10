import { destinationByName, type Destination } from '@/lib/data';
import type { DayBlock, DayPlan } from '@/lib/itinerary';
import { quotedActivityCost } from '@/lib/activities';

export type NarrativeQuote = { activityCosts: Record<string, number>; activitySelections?: Record<string, boolean> };

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
  'Gulmarg|Pahalgam': 'through Tangmarg and Srinagar, then south through the orchard belt into the Lidder Valley',
  'Pahalgam|Gulmarg': 'through South Kashmir and Srinagar, then onwards through Tangmarg to the Pir Panjal foothills',
  'Sonamarg|Pahalgam': 'along the Sindh River to Srinagar, then south towards the Lidder Valley',
  'Pahalgam|Sonamarg': 'through South Kashmir and Srinagar, then along the Sindh River corridor',
  'Sonamarg|Gulmarg': 'along the Sindh River to Srinagar, then through Tangmarg towards Gulmarg',
  'Gulmarg|Sonamarg': 'through Tangmarg and Srinagar, then along the Sindh River towards Sonamarg',
};
const sightSentences: Record<string, string> = {
  'Dal Lake & Boulevard': 'Begin beside Dal Lake and walk along Boulevard Road, with views of the houseboats and Zabarwan foothills.',
  'Shankaracharya Temple': 'Visit Shankaracharya Temple for its hilltop view over Srinagar and Dal Lake.',
  'Pari Mahal': 'Walk through Pari Mahal’s historic terraces overlooking Dal Lake.',
  'Nishat Bagh': 'Explore the terraces and fountains of Nishat Bagh beside Dal Lake.',
  'Shalimar Bagh': 'Continue through Shalimar Bagh’s Mughal gardens and chinar-lined paths.',
  'Chashme Shahi': 'Visit Chashme Shahi, the Mughal garden built around a natural spring.',
  'Gulmarg Meadow': 'Walk across Gulmarg’s central meadow with the Pir Panjal mountains in view.',
  'St. Mary\'s Church': 'Visit St. Mary’s Church in the heart of Gulmarg.',
  'Maharani Temple': 'Visit Maharani Temple overlooking the Gulmarg meadow.',
  'Lidder River & Pahalgam town': 'Walk beside the Lidder River and through Pahalgam town.',
  'Pahalgam market & riverside walks': 'Explore Pahalgam market and the nearby riverside paths.',
  'Aru Valley': 'Explore Aru Valley’s meadows, pine forests and mountain views.',
  'Betaab Valley': 'Continue to Betaab Valley for its river views and mountain scenery.',
  'Chandanwari': 'Visit Chandanwari at the upper end of the Pahalgam valley.',
  'Baisaran Valley': 'Explore Baisaran Valley’s meadow surrounded by pine-covered slopes.',
  'Sonamarg Meadow': 'Walk through Sonamarg Meadow beside the Sindh River and its mountain backdrop.',
  'Thajiwas Glacier area': 'Explore the Thajiwas area and its alpine streams and mountain views.',
  'Sindh River': 'Stop beside the Sindh River for the valley’s mountain scenery.',
  'Doodhpathri Meadows': 'Walk through the open meadows of Doodhpathri.',
  'Shaliganga River': 'Spend time beside the Shaliganga River and its meadow banks.',
  'Dawar Village': 'Explore Dawar’s traditional village lanes in Gurez Valley.',
  'Kishanganga River': 'Walk beside the Kishanganga River with the Gurez mountains in view.',
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

function listNames(names: string[]) {
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function blockDestination(block: DayBlock, day: DayPlan) {
  if (block.destination) return block.destination;
  // Older saved itineraries lack the destination field. Their generated
  // sightseeing names still identify the original stop after an update.
  if (day.from !== day.stay && destinationByName(day.from)?.local_sightseeing.some((site) => site.name === block.name)) return day.from;
  return day.stay;
}

function plannedStops(day: DayPlan, destination: string) {
  return day.blocks.filter((block) => block.kind !== 'arrival' && block.kind !== 'departure' && block.kind !== 'free-time'
    && !block.name.toLowerCase().endsWith('day trip') && !block.name.startsWith('Explore ')
    && !['EXTRA', 'EXCLUDED', 'OPTIONAL'].includes(block.intelligence?.status || '')
    && blockDestination(block, day) === destination).map((block) => block.name);
}

function referencedPlaces(text: string, destination: NonNullable<ReturnType<typeof destinationByName>>) {
  const labels = [...new Set([...destination.local_sightseeing.map((site) => site.name), ...destination.highlights])];
  return labels.filter((label) => text.toLowerCase().includes(label.toLowerCase()));
}

function matchesPlannedPlace(label: string, planned: string[]) {
  const name = label.toLowerCase();
  return planned.some((stop) => stop.toLowerCase().includes(name) || name.includes(stop.toLowerCase()));
}

function sightseeingCopy(stops: string[]) {
  if (!stops.length) return '';
  const featured = stops.slice(0, 2).map((name, index) => sightSentences[name] || `${index ? 'Continue to' : 'Visit'} ${name}.`);
  if (stops.length > 2) featured.push(`Then visit ${listNames(stops.slice(2))}.`);
  return featured.join(' ');
}

export function activitySentence(raw: string) {
  const phrase = raw.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
    .replace(/\s+(?:only )?where\b.*$/i, '')
    .replace(/\s+in season$/i, '');
  if (!phrase) return '';
  if (/^(?:(?:enjoy )?take (?:the )?|enjoy (?:the |a )?)?gondola(?: ride)?$/i.test(phrase)) return 'Enjoy a gondola ride.';
  if (/^shikara ride$/i.test(phrase)) return 'Enjoy a shikara ride.';
  if (/^old-city heritage walk$/i.test(phrase)) return 'Take a heritage walk through the old city.';
  if (/^Kashmiri food and kahwa experience$/i.test(phrase)) return 'Enjoy Kashmiri food and kahwa.';
  if (/^houseboat stay$/i.test(phrase)) return 'Stay on a houseboat.';
  if (/^floating market visit$/i.test(phrase)) return 'Visit the floating market.';
  if (/^ride (?:a |the )?shikara (.+)$/i.test(phrase)) return `Enjoy a shikara ride ${phrase.replace(/^ride (?:a |the )?shikara /i, '')}.`;
  if (/^trekking from Aru\s*\/\s*Pahalgam trails$/i.test(phrase)) return 'Explore the trekking trails around Aru and Pahalgam.';
  if (/^stay on or visit a traditional houseboat$/i.test(phrase)) return 'Visit a traditional houseboat.';
  if (/^keep a leisure day for the town and river$/i.test(phrase)) return 'Walk through the town and along the river.';
  if (/^enjoy\s+/i.test(phrase)) {
    const rest = phrase.replace(/^enjoy\s+/i, '').replace(/^(?:take|ride)\s+/i, '');
    return `Enjoy ${rest}.`;
  }
  if (/^(?:walk|explore|visit|taste|try|see|spend|travel|ride|use|combine|stay|take)\b/i.test(phrase)) return `${phrase[0].toUpperCase()}${phrase.slice(1)}.`;
  const lower = /^(?:Dal|Gulmarg|Srinagar|Pahalgam|Sonamarg|Aru|Betaab|Baisaran|Kashmiri|Old-city)\b/.test(phrase)
    ? phrase : `${phrase[0].toLowerCase()}${phrase.slice(1)}`;
  const article = /\b(?:ride|walk|excursion|experience)$/.test(lower) ? (/^[aeiou]/i.test(lower) ? 'an ' : 'a ') : '';
  return `Enjoy ${article}${lower}.`;
}

function visitCopy(day: DayPlan, destination: string, planned: string[], quote?: NarrativeQuote) {
  const guide = destinationByName(destination);
  const primary = day.primaryVisitFor?.includes(destination) ?? day.dayTripDestination === destination;
  const quotedActivities = quote && guide ? guide.activities.filter((name) => quotedActivityCost(
    quote.activityCosts, { key: `${destination}\u001f${name}`, destination, name, available: true }, quote.activitySelections || {},
  ) !== null) : guide?.enabled_activities || [];
  // The Gondola's mountain stations are reached through a separately quoted
  // activity, so sightseeing copy must never promise them on an unpriced trip.
  const clientStops = quote ? planned.filter((name) => !/gondola|kongdori|apharwat/i.test(name)) : planned;
  const noteSentences = primary && guide?.day_note?.trim()
    ? (guide.day_note.match(/[^.!?]+[.!?]?/g) || []).map((sentence) => sentence.trim()).filter((sentence) => {
      if (/\b(after breakfast|check out|check in|overnight|drive to|return to|departure|pick-up|pickup)\b/i.test(sentence)) return false;
      if (quote && /gondola|shikara|pony ride|horse rid|rafting|skiing|snowboarding/i.test(sentence)) return false;
      return referencedPlaces(sentence, guide).every((place) => matchesPlannedPlace(place, clientStops));
    }).slice(0, 2) : [];
  const note = noteSentences.join(' ');
  const namedInNote = guide ? referencedPlaces(note, guide) : [];
  const remainingStops = clientStops.filter((stop) => !namedInNote.some((place) => matchesPlannedPlace(place, [stop])));
  const stops = sightseeingCopy(remainingStops);
  const generalThings = (guide?.enabled_things_to_do || []).filter((item) =>
    !/\b(gondola|shikara|pony|horse rid|rafting|skiing|snowboarding|helicopter|angling|fishing)\b/i.test(item)
    && !/^(use|combine|plan|build|allow|treat|do not|pair|dedicate|start early|visit during)\b/i.test(item));
  const experiences = guide ? [...new Set([...generalThings, ...quotedActivities])].filter((item) => {
    if (note.toLowerCase().includes(item.toLowerCase())) return false;
    const places = referencedPlaces(item, guide);
    if (places.length) return places.every((place) => matchesPlannedPlace(place, clientStops)) && !/^(visit|explore|see)\b/i.test(item);
    return primary;
  }) : [];
  const experienceText = experiences.map(activitySentence).filter(Boolean).join(' ');
  return [note, stops, experienceText].filter(Boolean).join(' ');
}

export function dayNarrative(day: DayPlan, pickup: string, quote?: NarrativeQuote) {
  if (day.customAbout?.trim()) return day.customAbout.trim();
  const arrivalAt = /airport|station|terminal/i.test(pickup) ? 'at' : 'in';
  const route = corridors[`${day.from}|${day.stay}`] || (day.drive.via?.length ? `via ${day.drive.via.join(' and ')}` : 'along the Kashmir valley route');
  if (day.label === 'Departure day') {
    return day.stay === day.to
      ? `After breakfast, check out from your ${day.stay} hotel and proceed to your departure point in ${day.to}. Your driver will complete the final transfer.`
      : `After breakfast, check out from your ${day.stay} hotel and drive to ${day.to} ${corridors[`${day.stay}|${day.to}`] || (day.drive.via?.length ? `via ${day.drive.via.join(' and ')}` : 'along the planned route')}. Continue to your departure point for the onward journey.`;
  }

  const excursion = day.blocks.find((block) => block.name.toLowerCase().endsWith('day trip'));
  const destination = day.dayTripDestination || excursion?.name.replace(/ day trip$/i,'') || day.stay;
  if (excursion) {
    const legacySights = excursion.intelligence?.note?.match(/(?:Template|Planned) highlights: (.+?)\.?$/i)?.[1]?.split(' · ') || [];
    const sights = excursion.sights?.length ? excursion.sights : legacySights;
    const outward = corridors[`${day.from}|${destination}`] || (day.drive.via?.length ? `via ${day.drive.via.join(' and ')}` : 'through the Kashmir countryside');
    const opening = day.day === 1
      ? `Arrive ${arrivalAt} ${pickup}, meet your Chakar representative and travel to ${destination} ${outward}.`
      : day.transfer
        ? `After breakfast, check out from your ${day.from} hotel and travel to ${destination} ${outward}.`
        : `After breakfast, set out from ${day.stay} for ${destination} ${outward}.`;
    const closing = day.transfer
      ? `Continue to ${day.stay} for hotel check-in and an overnight stay.`
      : `Return to your ${day.stay} hotel by evening. Overnight in ${day.stay}.`;
    return [opening, visitCopy(day, destination, sights, quote), closing].filter(Boolean).join(' ');
  }

  const destinationCopy = visitCopy(day, day.stay, plannedStops(day, day.stay), quote);
  if (day.day === 1) {
    const opening = day.stay.toLowerCase() === pickup.toLowerCase()
      ? `Arrive ${arrivalAt} ${pickup}, meet your Chakar representative and check in to your hotel.`
      : `Arrive ${arrivalAt} ${pickup}, meet your Chakar representative and travel to ${day.stay} ${route}. Check in on arrival.`;
    return [opening, destinationCopy || `Take a short orientation walk near your hotel.`, `Overnight in ${day.stay}.`].join(' ');
  }
  if (day.transfer) {
    const originCopy = visitCopy(day, day.from, plannedStops(day, day.from), quote);
    const opening = `After breakfast, check out from your ${day.from} hotel.`;
    const transfer = `Drive to ${day.stay} ${route} and check in on arrival.`;
    return [opening, originCopy, transfer, destinationCopy || `Take a short orientation walk near your hotel.`, `Overnight in ${day.stay}.`].filter(Boolean).join(' ');
  }
  return [`After breakfast, set out for ${day.stay === 'Srinagar' ? 'Srinagar local sightseeing' : `${day.stay} sightseeing`}.`, destinationCopy || `Take a guided walk through the area near your hotel.`, `Return to your ${day.stay} hotel for the night.`].join(' ');
}
