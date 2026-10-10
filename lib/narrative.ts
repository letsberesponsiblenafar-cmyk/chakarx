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
  const noteSentences = primary && guide?.day_note?.trim()
    ? (guide.day_note.match(/[^.!?]+[.!?]?/g) || []).map((sentence) => sentence.trim()).filter((sentence) => {
      if (/\b(after breakfast|check out|check in|overnight|drive to|return to|departure|pick-up|pickup)\b/i.test(sentence)) return false;
      return referencedPlaces(sentence, guide).every((place) => matchesPlannedPlace(place, planned));
    }).slice(0, 2) : [];
  const note = noteSentences.join(' ');
  const namedInNote = guide ? referencedPlaces(note, guide) : [];
  const remainingStops = planned.filter((stop) => !namedInNote.some((place) => matchesPlannedPlace(place, [stop])));
  const stops = remainingStops.length ? `Visit ${listNames(remainingStops)}.` : '';
  const quotedActivities = quote && guide ? guide.activities.filter((name) => quotedActivityCost(
    quote.activityCosts, { key: `${destination}\u001f${name}`, destination, name, available: true }, quote.activitySelections || {},
  ) !== null) : guide?.enabled_activities || [];
  const experiences = guide ? [...new Set([...(guide.enabled_things_to_do || []), ...quotedActivities])].filter((item) => {
    if (note.toLowerCase().includes(item.toLowerCase())) return false;
    const places = referencedPlaces(item, guide);
    if (places.length) return places.every((place) => matchesPlannedPlace(place, planned)) && !/^(visit|explore|see)\b/i.test(item);
    return primary;
  }) : [];
  const experienceText = experiences.map(activitySentence).filter(Boolean).join(' ');
  return [note, stops, experienceText].filter(Boolean).join(' ');
}

export function dayNarrative(day: DayPlan, pickup: string, quote?: NarrativeQuote) {
  if (day.customAbout?.trim()) return day.customAbout.trim();
  if (day.label === 'Departure day') {
    return day.stay === day.to
      ? `After breakfast, check out from your ${day.stay} hotel and travel to the selected departure terminal in ${day.to}. Keep the sightseeing window flexible around the reporting time. Your driver will assist with the final transfer.`
      : `After breakfast, check out from ${day.stay} and travel to ${day.to} for departure. Your driver will assist with the final transfer to the selected terminal.`;
  }

  const excursion = day.blocks.find((block) => block.name.toLowerCase().endsWith('day trip'));
  const destination = day.dayTripDestination || excursion?.name.replace(/ day trip$/i,'') || day.stay;
  const route = corridors[`${day.from}|${day.stay}`] || (day.drive.via?.length ? `via ${day.drive.via.join(' and ')}` : 'along the planned Kashmir route');
  if (excursion) {
    const legacySights = excursion.intelligence?.note?.match(/(?:Template|Planned) highlights: (.+?)\.?$/i)?.[1]?.split(' · ') || [];
    const sights = excursion.sights?.length ? excursion.sights : legacySights;
    const opening = day.day === 1
      ? `On arrival at ${pickup}, meet your driver and visit ${destination} before returning to your ${day.stay} hotel.`
      : day.transfer
        ? `After breakfast, check out from ${day.from} and visit ${destination} before continuing to ${day.stay} for check-in.`
        : `After breakfast, leave ${day.stay} for a day trip to ${destination} and return to the same hotel by evening.`;
    return [opening, visitCopy(day, destination, sights, quote), `Overnight in ${day.stay}.`].filter(Boolean).join(' ');
  }

  const destinationCopy = visitCopy(day, day.stay, plannedStops(day, day.stay), quote);
  if (day.day === 1) {
    const opening = day.stay.toLowerCase() === pickup.toLowerCase()
      ? `Arrive at ${pickup}, meet your driver and transfer to the hotel for check-in.`
      : `Arrive at ${pickup}, meet your driver and travel to ${day.stay} ${route}. Check in on arrival.`;
    return [opening, destinationCopy || `Take a short orientation walk near the hotel before returning for the evening.`, `Overnight in ${day.stay}.`].join(' ');
  }
  if (day.transfer) {
    const originCopy = visitCopy(day, day.from, plannedStops(day, day.from), quote);
    const opening = `After breakfast, check out from ${day.from}.`;
    const transfer = `Drive to ${day.stay} ${route} and check in.`;
    return [opening, originCopy, transfer, destinationCopy || `Take a short orientation walk near the hotel before returning for the evening.`, `Overnight in ${day.stay}.`].filter(Boolean).join(' ');
  }
  return [`After breakfast, set out for sightseeing in ${day.stay}.`, destinationCopy || `Take a guided walk through the area near your hotel.`, `Overnight in ${day.stay}.`].join(' ');
}
