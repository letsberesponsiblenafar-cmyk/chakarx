import type { HotelSelection } from '@/components/PlannerProvider';
import type { Hotel } from '@/lib/data';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';
import { hotelPackageCategory, isPackageHotelBand, isHouseboatHotel, matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';

export type HotelOptionMode = 'single' | 'multiple';
export type HotelRateBundle = Pick<HotelOptionQuote, 'nightlyRate' | 'extraBedRate' | 'cnbRate'>;
/** A supplier quote, separate from the stay's shared rooms and overnight dates. */
export type HotelOptionQuote = {
  /** Stable identity for an operator-entered alternative without a master record. */
  customId?: string;
  hotelId: string; hotelName: string; category: string; starRating: number | null;
  address: string; roomType: string; website: string;
  nightlyRate: number; extraBedRate: number; cnbRate: number; source: string; status: string;
};

export function hotelOptionFromSelection(hotel: HotelOptionQuote): HotelOptionQuote {
  const { customId, hotelId, hotelName, category, starRating, address, roomType, website, nightlyRate, extraBedRate, cnbRate, source, status } = hotel;
  return { ...(customId ? { customId } : {}), hotelId, hotelName, category, starRating, address, roomType, website, nightlyRate, extraBedRate, cnbRate, source, status };
}

const normalizedName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
export function hotelOptionIdentity(option: HotelOptionQuote) { return option.customId || option.hotelId; }
/** An empty custom slot expresses operator intent, without adding a quoted property. */
export function isUnusedHotelOption(option: HotelOptionQuote) {
  return Boolean(option.customId) && !option.hotelName.trim() && option.nightlyRate === 0 && option.extraBedRate === 0 && option.cnbRate === 0;
}
export function sameHotelOption(left: HotelOptionQuote, right: HotelOptionQuote) {
  return Boolean(hotelOptionIdentity(left) && hotelOptionIdentity(left) === hotelOptionIdentity(right)) ||
    Boolean(normalizedName(left.hotelName) && normalizedName(left.hotelName) === normalizedName(right.hotelName));
}
export function hotelOptionNightlyCost(option: HotelOptionQuote, occupancy: Pick<HotelSelection, 'rooms' | 'extraBeds' | 'cnb'>) {
  return occupancy.rooms * option.nightlyRate + occupancy.extraBeds * option.extraBedRate + occupancy.cnb * option.cnbRate;
}

function isCustomProperty(option: HotelOptionQuote) {
  return !option.hotelId && (Boolean(option.customId) || /^Custom (?:hotel|houseboat)$/i.test(option.source) ||
    Boolean(option.hotelName.trim() && !/^(?:hotel|houseboat) to be (?:added|confirmed)$/i.test(option.hotelName.trim())));
}

/** All custom names describe one negotiated supplier quote for the stay. */
export function allHotelOptionsCustom(hotel: HotelSelection, mode: HotelOptionMode = 'single') {
  return mode === 'multiple' && isCustomProperty(hotel) &&
    (hotel.alternatives || []).slice(0, 2).every(isCustomProperty);
}

/** Keep a complete supplier bundle together rather than mixing its rate columns. */
export function highestCompleteHotelRates(hotel: HotelSelection): HotelRateBundle {
  const options = [hotel, ...(hotel.alternatives || []).slice(0, 2)].filter((option) =>
    Number.isFinite(option.nightlyRate) && option.nightlyRate > 0 &&
    [option.extraBedRate, option.cnbRate].every((rate) => Number.isFinite(rate) && rate >= 0));
  const highest = options.reduce<HotelOptionQuote | undefined>((best, option) =>
    !best || hotelOptionNightlyCost(option, hotel) > hotelOptionNightlyCost(best, hotel) ? option : best, undefined);
  return highest ? { nightlyRate: highest.nightlyRate, extraBedRate: highest.extraBedRate, cnbRate: highest.cnbRate }
    : { nightlyRate: 0, extraBedRate: 0, cnbRate: 0 };
}

/** Old saved custom quotes safely inherit their highest existing whole-group bundle. */
export function sharedCustomHotelRates(hotel: HotelSelection, mode: HotelOptionMode = 'single'): HotelRateBundle | null {
  if (!allHotelOptionsCustom(hotel, mode)) return null;
  const stored = hotel.sharedCustomRates;
  return stored ? { nightlyRate: stored.nightlyRate, extraBedRate: stored.extraBedRate, cnbRate: stored.cnbRate }
    : highestCompleteHotelRates(hotel);
}

export function hotelOptions(hotel: HotelSelection, mode: HotelOptionMode = 'single'): HotelOptionQuote[] {
  const options = [hotelOptionFromSelection(hotel)];
  if (mode === 'multiple') for (const alternative of (hotel.alternatives || []).slice(0, 2)) {
    if (isUnusedHotelOption(alternative)) continue;
    if (!options.some((option) => sameHotelOption(option, alternative))) options.push(hotelOptionFromSelection(alternative));
  }
  return options.sort((a, b) => hotelOptionNightlyCost(a, hotel) - hotelOptionNightlyCost(b, hotel) || a.hotelName.localeCompare(b.hotelName));
}

/** Bill one complete property quote; alternative properties are never added together. */
export function effectiveHotelSelection(hotel: HotelSelection, mode: HotelOptionMode = 'single'): HotelSelection {
  const shared = sharedCustomHotelRates(hotel, mode);
  if (shared) return { ...hotel, ...shared };
  const options = hotelOptions(hotel, mode);
  return mode === 'multiple' && options.length > 1 ? { ...hotel, ...options[options.length - 1] } : hotel;
}

export function hotelOptionNames(hotel: HotelSelection, mode: HotelOptionMode = 'single') {
  return hotelOptions(hotel, mode).map((option) => option.hotelName.trim()).filter(Boolean);
}

export function hotelOptionCategory(primary: HotelSelection, database: Hotel[]) {
  const record = primary.hotelId ? database.find((hotel) => hotel.id === primary.hotelId) : undefined;
  if (record) return record.normalizedCategory;
  return ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'].includes(primary.category) ? null : primary.category;
}

/** Manual package classifications take precedence over legacy supplier classes. */
export function hotelOptionMatchesCategory(primary: HotelSelection, option: HotelOptionQuote | Hotel, database: Hotel[]) {
  const category = hotelOptionCategory(primary, database);
  if (category === null) return true;
  const optionCategory = 'normalizedCategory' in option ? option.normalizedCategory
    : database.find((hotel) => hotel.id === option.hotelId)?.normalizedCategory || option.category;
  if (isPackageHotelBand(category) || isPackageHotelBand(optionCategory)) {
    const primaryBand = hotelPackageCategory({ normalizedCategory: category });
    return primaryBand !== null && primaryBand === hotelPackageCategory({ normalizedCategory: optionCategory });
  }
  return optionCategory === category;
}

/** The same compatible inventory powers automatic suggestions and the compact selectors. */
export function hotelAlternativeCandidates(primary: HotelSelection, database: Hotel[], packageCategory: string, arrival?: string, departure?: string) {
  const primaryIsBoat = primary.accommodationType ? primary.accommodationType === 'houseboat' : isHouseboatHotel({ name: primary.hotelName, roomType: primary.roomType, sourceCategory: primary.category, sourceType: primary.source });
  const referenceRate = sharedCustomHotelRates(primary, 'multiple')?.nightlyRate ?? primary.nightlyRate;
  if (!Number.isFinite(referenceRate) || !(referenceRate > 0) || !primary.hotelName.trim() || /^(?:hotel|houseboat) to be (?:added|confirmed)$/i.test(primary.hotelName.trim())) return [];
  return database.filter((hotel) => {
    if (!sameHotelDestination(hotel.destination, primary.location) || !matchesPackageCategory(hotel, packageCategory) ||
      !hotelOptionMatchesCategory(primary, hotel, database) || isHouseboatHotel(hotel) !== primaryIsBoat ||
      hotel.id === primary.hotelId || normalizedName(hotel.name) === normalizedName(primary.hotelName) ||
      !Number.isFinite(hotel.mapB2B) || !hotel.mapB2B || hotel.mapB2B < referenceRate * 0.7 || hotel.mapB2B > referenceRate * 1.3 ||
      /unavailable|sold out|closed/i.test(hotel.availabilityStatus) || hotelRateValidity(hotel, arrival, departure) === 'outside') return false;
    return true;
  }).filter((hotel, index, records) => records.findIndex((record) => record.id === hotel.id || normalizedName(record.name) === normalizedName(hotel.name)) === index).sort((a, b) => {
    const verified = (hotel: Hotel) => hotelRateValidity(hotel, arrival, departure) === 'matching' ? 0 : 1;
    return verified(a) - verified(b) || Math.abs((a.mapB2B || 0) - referenceRate) - Math.abs((b.mapB2B || 0) - referenceRate) || a.name.localeCompare(b.name);
  });
}
