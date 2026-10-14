import { destinationByName, enabledSightseeing, type Destination } from '@/lib/data';
import type { DayBlock, DayPlan } from '@/lib/itinerary';
import { quotedActivityCost } from '@/lib/activities';
import { dayVisitLabel } from '@/lib/journey-labels';

export type NarrativeQuote = { activityCosts: Record<string, number>; activitySelections?: Record<string, boolean> };
export type NarrativeAccommodation = { current?: 'hotel' | 'houseboat'; previous?: 'hotel' | 'houseboat' };

// Route language follows the supplied Chakar itinerary playbook and sample packages.
// Client copy is composed from the operator's selected route and destination guide.
const corridors: Record<string,string> = {
  'Srinagar|Gulmarg': 'through Tangmarg and the foothills of the Pir Panjal',
  'Gulmarg|Srinagar': 'through Tangmarg into the Kashmir Valley',
  'Srinagar|Pahalgam': 'through South Kashmir, the saffron and orchard belt, and the Lidder Valley',
  'Pahalgam|Srinagar': 'along the Lidder Valley and South Kashmir countryside',
  'Srinagar|Sonamarg': 'along the Sindh River corridor via Kangan',
  'Sonamarg|Srinagar': 'along the Sindh River corridor through Kangan',
  'Srinagar|Gurez': 'via Bandipora and Razdan Pass towards Dawar and the Kishanganga River',
  'Gurez|Srinagar': 'over Razdan Pass and through Bandipora',
  'Srinagar|Doodhpathri': 'through the Budgam countryside towards the Shaliganga River meadows',
  'Doodhpathri|Srinagar': 'through the Budgam countryside',
  'Srinagar|Naranag': 'through the Sindh Valley towards the Wangath and Naranag heritage area',
  'Naranag|Srinagar': 'through the Sindh Valley',
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
export function sightseeingSentence(sight: { name: string; description: string; client_sentence?: string }) {
  const authored = sight.client_sentence?.trim();
  if (authored) return /[.!?]$/.test(authored) ? authored : `${authored}.`;
  if (sightSentences[sight.name]) return sightSentences[sight.name];
  const detail = sight.description.trim().replace(/[.!?]+$/, '').replace(/^(?:a|an|the)\s+/i, '');
  return detail ? `Visit ${sight.name} for its ${detail[0].toLowerCase()}${detail.slice(1)}.` : `Visit ${sight.name}.`;
}
const destinationStory: Record<string,string> = {
  Srinagar: 'Discover Srinagar’s lakeside setting and cultural heritage.',
  Gulmarg: 'Discover Gulmarg’s alpine setting and Pir Panjal scenery.',
  Pahalgam: 'Explore Pahalgam’s pine-lined mountain valley.',
  Sonamarg: 'Discover Sonamarg’s high valley and mountain scenery.',
  Doodhpathri: 'Explore Doodhpathri’s open meadow landscape.',
  Naranag: 'Discover Naranag’s mountain setting and heritage.',
  Gurez: 'Discover the mountain-village landscape of Gurez.',
};
export function defaultDayNote(destination: Destination) {
  return destinationStory[destination.name] || destination.description || `Explore ${destination.name}.`;
}

export function dayTitle(day: DayPlan, pickup: string) {
  if (day.customTitle?.trim()) return day.customTitle.trim();
  if (day.day === 1) return day.dayTripDestination
    ? `Arrival in ${pickup} & ${dayVisitLabel(day)}${day.stay !== day.dayTripDestination && day.additionalVisitDestinations?.includes(day.stay) ? ` & ${day.stay} sightseeing` : ''}`
    : day.stay.toLowerCase() === pickup.toLowerCase() || pickup.toLowerCase().includes(day.stay.toLowerCase())
    ? `Arrival in ${day.stay}${plannedStops(day, day.stay).length ? ` & ${day.stay === 'Srinagar' ? 'local sightseeing' : 'sightseeing'}` : ''}`
    : `Arrival in ${pickup} & transfer to ${day.stay}`;
  if (day.label === 'Departure day') return day.stay !== day.to
    ? `${day.stay} to ${day.to} & departure`
    : plannedStops(day, day.stay).length || day.scheduledActivities?.length ? `${day.to} sightseeing & departure` : `Departure from ${day.to}`;
  if (day.dayTripDestination) return `${dayVisitLabel(day)}${day.stay !== day.dayTripDestination && day.additionalVisitDestinations?.includes(day.stay) ? ` & ${day.stay} sightseeing` : ''}`;
  if (day.transfer && day.stay === 'Srinagar' && day.from !== day.stay) return dayVisitLabel(day);
  if (day.transfer) return `${day.from} to ${day.stay}${day.stay === 'Srinagar' && plannedStops(day, day.stay).length ? ' & local sightseeing' : ''}`;
  const excursion = day.blocks.find((block) => block.name.toLowerCase().includes('day trip'));
  return excursion ? dayVisitLabel(day, excursion.destination || excursion.name.replace(/ day trip$/i, '')) : dayVisitLabel(day);
}

function blockDestination(block: DayBlock, day: DayPlan) {
  if (block.destination) return block.destination;
  // Older saved itineraries lack the destination field. Their generated
  // sightseeing names still identify the original stop after an update.
  if (day.from !== day.stay && destinationByName(day.from)?.local_sightseeing.some((site) => site.name === block.name)) return day.from;
  return day.stay;
}

function plannedStops(day: DayPlan, destination: string) {
  const guide = destinationByName(destination);
  const checked = new Set(guide ? enabledSightseeing(guide) : []);
  return [...new Set(day.blocks.filter((block) => block.kind !== 'arrival' && block.kind !== 'departure' && block.kind !== 'free-time'
    && blockDestination(block, day) === destination).flatMap((block) => {
      if (block.kind === 'custom' && !guide?.local_sightseeing.some((sight) => sight.name === block.name)) return [block.name];
      const names = block.sights !== undefined ? block.sights : block.name.toLowerCase().endsWith('day trip')
        ? block.intelligence?.note?.match(/(?:Template|Planned) highlights: (.+?)\.?$/i)?.[1]?.split(' · ') || [] : [block.name];
      return names.filter((name) => checked.has(name) || block.librarySights?.some((selection) => {
        const selectedGuide = destinationByName(selection.destination);
        return selection.visitName === name && selectedGuide && enabledSightseeing(selectedGuide).includes(selection.name);
      }));
    }))];
}

function referencedPlaces(text: string, destination: NonNullable<ReturnType<typeof destinationByName>>) {
  const labels = [...new Set([...destination.local_sightseeing.map((site) => site.name), ...destination.highlights])];
  return labels.filter((label) => text.toLowerCase().includes(label.toLowerCase()));
}

function matchesPlannedPlace(label: string, planned: string[]) {
  const name = label.toLowerCase();
  return planned.some((stop) => stop.toLowerCase().includes(name) || name.includes(stop.toLowerCase()));
}

function sightseeingLines(day: DayPlan, stops: string[], destination: Destination | undefined) {
  const sentences = stops.flatMap((name) => {
    const selections = day.blocks.filter((block) => blockDestination(block, day) === destination?.name)
      .flatMap((block) => (block.librarySights || []).filter((selection) => selection.visitName === name));
    if (!selections.length) return [sightseeingSentence(destination?.local_sightseeing.find((sight) => sight.name === name) || { name, description: '' })];
    return selections.flatMap((selection) => {
      const guide = destinationByName(selection.destination);
      const sight = guide?.local_sightseeing.find((item) => item.name === selection.name);
      return guide && sight && enabledSightseeing(guide).includes(sight.name) ? [sightseeingSentence(sight)] : [];
    });
  });
  return [...new Map(sentences.map((sentence) => [sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), sentence])).values()];
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

function visitCopy(day: DayPlan, destination: string, planned: string[], quote?: NarrativeQuote, options: { introduction?: boolean; activitiesOnly?: boolean } = {}) {
  const guide = destinationByName(destination);
  const primary = day.primaryVisitFor?.includes(destination) ?? day.dayTripDestination === destination;
  // Scheduled activities are authoritative, including an explicitly empty
  // list. The fallback only supports saved plans from before timed scheduling.
  const timedActivities = day.scheduledActivities?.filter((activity) => activity.destination === destination);
  const quotedActivities = timedActivities !== undefined
    ? timedActivities.filter((activity) => {
      const available = Boolean(guide?.enabled_activities?.includes(activity.name));
      return available && (!quote || quotedActivityCost(quote.activityCosts, { ...activity, available }, quote.activitySelections || {}) !== null);
    }).map((activity) => activity.name)
    : quote && guide ? guide.activities.filter((name) => quotedActivityCost(
      quote.activityCosts, { key: `${destination}\u001f${name}`, destination, name, available: (guide.enabled_activities || []).includes(name) }, quote.activitySelections || {},
    ) !== null) : [];
  // Only library ticks control sightseeing. A separately quoted activity never
  // replaces the selected place's planned itinerary sentence.
  const clientStops = options.activitiesOnly ? [] : planned;
  const noteSource = guide ? guide.day_note?.trim() || defaultDayNote(guide) : '';
  // An overnight hotel does not create an additional sightseeing programme.
  // Introduce a destination only on its main visit, with actual assigned places
  // or experiences, rather than repeating its guide whenever the hotel is here.
  const hasProgramme = clientStops.length > 0 || quotedActivities.length > 0;
  const noteSentences = options.introduction !== false && hasProgramme && primary && noteSource
    ? (noteSource.match(/[^.!?]+[.!?]?/g) || []).map((sentence) => sentence.trim()).filter((sentence) => {
      if (/\b(after breakfast|check out|check in|overnight|drive to|return to|departure|pick-up|pickup)\b/i.test(sentence)) return false;
      if (/\b(confirm|subject to|weather|road access|availability|provisional)\b/i.test(sentence)) return false;
      if (/\b(own pace|at leisure|rest of the day|free time|comfortable pace)\b/i.test(sentence)) return false;
      if (quote && /gondola|shikara|pony ride|horse rid|rafting|skiing|snowboarding/i.test(sentence)) return false;
      // A place gets its own authored sentence below; the introduction should
      // never consume or duplicate one of those selected sightseeing lines.
      return referencedPlaces(sentence, guide!).length === 0;
    }).slice(0, 2) : [];
  const note = noteSentences.join(' ');
  const selectedLines = sightseeingLines(day, clientStops, guide);
  const stops = selectedLines.join(' ');
  const experiences = guide ? [...new Set(quotedActivities)].filter((item) => {
    if (timedActivities !== undefined) return true;
    const places = referencedPlaces(item, guide);
    if (places.length) return places.every((place) => matchesPlannedPlace(place, clientStops)) && !/^(visit|explore|see)\b/i.test(item);
    return primary;
  }) : [];
  const sentenceForActivity = (name: string) => {
    const authored = guide?.activity_copy?.[name]?.trim();
    return authored ? /[.!?]$/.test(authored) ? authored : `${authored}.` : activitySentence(name);
  };
  const early = (name: string) => (guide?.activity_timing?.[name]?.time_window?.end ?? 1440) <= 8 * 60;
  const uniqueSentences = new Set([...noteSentences, ...selectedLines]
    .map((sentence) => sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()));
  const activityCopy = (names: string[]) => names.map(sentenceForActivity).filter((sentence) => {
    const identity = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!identity || uniqueSentences.has(identity)) return false;
    uniqueSentences.add(identity); return true;
  }).join(' ');
  const earlyText = activityCopy(experiences.filter(early));
  const experienceText = activityCopy(experiences.filter((name) => !early(name)));
  return [note, earlyText, stops, experienceText].filter(Boolean).join(' ');
}

function travelCopy(from: string, to: string, via: string[] = []) {
  if (from === to) return '';
  const access = destinationByName(to)?.hub_route;
  const corridor = corridors[`${from}|${to}`] || (via.length ? `via ${via.join(' and ')}` : 'through the Kashmir countryside');
  if (access && access.access_mode !== 'road') {
    const onward = access.access_mode === 'trek' ? `Continue on foot towards ${to}.` : `Continue along the pilgrimage route towards ${to}.`;
    return `Drive to ${access.road_endpoint} ${corridor}. ${onward}`;
  }
  return `Drive to ${to} ${corridor}.`;
}

export function dayNarrative(day: DayPlan, pickup: string, quote?: NarrativeQuote, accommodation: NarrativeAccommodation = {}) {
  if (day.customAbout?.trim()) return day.customAbout.trim();
  const arrivalAt = /airport|station|terminal/i.test(pickup) ? 'at' : 'in';
  const currentStay = accommodation.current || 'hotel';
  const previousStay = accommodation.previous || 'hotel';
  const changingStay = day.day > 1 && day.from === day.stay && currentStay !== previousStay;
  const overnight = currentStay === 'houseboat' ? `Overnight on your houseboat in ${day.stay}.` : `Overnight in ${day.stay}.`;
  if (day.label === 'Departure day') {
    const earlyCheckout = day.timing?.startMinutes !== undefined
      ? day.timing.startMinutes < 7 * 60 : Boolean(day.departureTime && day.departureTime < '08:00');
    const opening = earlyCheckout ? 'Check out early' : 'After breakfast, check out';
    const originCopy = visitCopy(day, day.stay, plannedStops(day, day.stay), quote);
    const finalCopy = day.stay !== day.to ? visitCopy(day, day.to, plannedStops(day, day.to), quote) : '';
    return day.stay === day.to
      ? [`${opening} from your ${day.stay} ${previousStay}.`, originCopy, `Your driver will transfer you to your departure point in ${day.to} for your onward journey.`].filter(Boolean).join(' ')
      : [`${opening} from your ${day.stay} ${previousStay}.`, originCopy,
        travelCopy(day.stay, day.to, day.drive.via),
        finalCopy, 'Continue to your departure point for the onward journey.'].filter(Boolean).join(' ');
  }

  const excursion = day.blocks.find((block) => block.name.toLowerCase().endsWith('day trip'));
  const destination = day.dayTripDestination || excursion?.name.replace(/ day trip$/i,'') || day.stay;
  if (day.dayTripDestination || excursion) {
    const sights = plannedStops(day, destination);
    const opening = day.day === 1
      ? `Arrive ${arrivalAt} ${pickup} and meet your Chakar representative.`
      : day.transfer || changingStay
        ? `After breakfast, check out from your ${day.from} ${previousStay}.`
        : `After breakfast, begin your day from ${day.stay}.`;
    const originCopy = day.from !== destination && day.from !== day.stay
      ? visitCopy(day, day.from, [], quote, { introduction: false, activitiesOnly: true }) : '';
    const additionalVisit = day.additionalVisitDestinations?.includes(day.stay);
    const hotelBaseCopy = day.stay !== destination
      ? visitCopy(day, day.stay, additionalVisit ? plannedStops(day, day.stay) : [], quote, { introduction: false, activitiesOnly: !additionalVisit }) : '';
    const returnTransfer = day.transfer
      ? `Continue to ${day.stay} and check in to your ${currentStay}.`
      : changingStay || (day.day === 1 && currentStay === 'houseboat')
        ? `Return to ${day.stay} after your visit and check in to your ${currentStay}.`
        : `Return to ${day.stay} after your visit.`;
    const access = destinationByName(destination)?.hub_route;
    const trailReturn = access && access.access_mode !== 'road'
      ? `${access.access_mode === 'trek' ? 'Walk back' : 'Return along the pilgrimage route'} to ${access.road_endpoint} before the onward road transfer.` : '';
    return [opening, originCopy, travelCopy(day.from, destination, day.drive.via), visitCopy(day, destination, sights, quote), trailReturn, returnTransfer, hotelBaseCopy, overnight].filter(Boolean).join(' ');
  }

  const localStops = plannedStops(day, day.stay);
  const hotelReturn = day.transfer && day.stay === 'Srinagar' && day.from !== day.stay;
  const destinationCopy = visitCopy(day, day.stay, localStops, quote, { introduction: !hotelReturn });
  if (day.day === 1) {
    const arrivalMinutes = day.arrivalTime && /^\d{2}:\d{2}$/.test(day.arrivalTime)
      ? Number(day.arrivalTime.slice(0, 2)) * 60 + Number(day.arrivalTime.slice(3)) : null;
    const checkInFirst = arrivalMinutes === null || arrivalMinutes + 90 + Math.round(day.drive.hours * 60) >= 14 * 60;
    const localArrival = day.from === day.stay || day.stay.toLowerCase() === pickup.toLowerCase();
    const opening = localArrival
      ? `Arrive ${arrivalAt} ${pickup} and meet your Chakar representative.${arrivalAt === 'at' ? ` Transfer to ${day.stay}.` : ''}`
      : `Arrive ${arrivalAt} ${pickup} and meet your Chakar representative. ${travelCopy(day.from, day.stay, day.drive.via)}`;
    const checkIn = `Check in to your ${day.stay} ${currentStay}.`;
    return [opening, checkInFirst ? checkIn : '', destinationCopy, !checkInFirst ? checkIn : '', overnight].filter(Boolean).join(' ');
  }
  if (day.transfer) {
    const originStops = plannedStops(day, day.from);
    const originCopy = originStops.length || day.scheduledActivities?.some((activity) => activity.destination === day.from)
      ? visitCopy(day, day.from, originStops, quote) : '';
    const opening = `After breakfast, check out from your ${day.from} ${previousStay}.`;
    const transfer = `${travelCopy(day.from, day.stay, day.drive.via)} ${currentStay === 'houseboat' ? 'Check in to your houseboat on arrival.' : 'Check in on arrival.'}`;
    return [opening, originCopy, transfer, destinationCopy, overnight].filter(Boolean).join(' ');
  }
  const programme = localStops.length || day.scheduledActivities?.some((activity) => activity.destination === day.stay);
  return [changingStay ? `After breakfast, check out from your ${day.from} ${previousStay}.` : '',
    programme ? `${changingStay ? 'Set out' : 'After breakfast, set out'} for ${day.stay === 'Srinagar' ? 'Srinagar local sightseeing' : `${day.stay} sightseeing`}.`
      : changingStay ? '' : `Begin the day with breakfast at your ${day.stay} ${previousStay}.`,
    destinationCopy, changingStay ? `Check in to your ${day.stay} ${currentStay}.` : '', overnight].filter(Boolean).join(' ');
}
