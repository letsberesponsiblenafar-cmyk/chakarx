import type { HotelSelection } from '@/components/PlannerProvider';
import type { Hotel } from '@/lib/data';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';
import { isHouseboatHotel, matchesPackageCategory, sameHotelDestination } from '@/lib/hotels';

export type HotelOptionMode = 'single' | 'multiple';
/** A supplier quote, separate from the stay's shared rooms and overnight dates. */
export type HotelOptionQuote = {
  hotelId: string; hotelName: string; category: string; starRating: number | null;
  address: string; roomType: string; website: string;
  nightlyRate: number; extraBedRate: number; cnbRate: number; source: string; status: string;
};

export function hotelOptionFromSelection(hotel: HotelOptionQuote): HotelOptionQuote {
  const { hotelId, hotelName, category, starRating, address, roomType, website, nightlyRate, extraBedRate, cnbRate, source, status } = hotel;
  return { hotelId, hotelName, category, starRating, address, roomType, website, nightlyRate, extraBedRate, cnbRate, source, status };
}

const normalizedName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
export function sameHotelOption(left: HotelOptionQuote, right: HotelOptionQuote) {
  return Boolean(left.hotelId && right.hotelId && left.hotelId === right.hotelId) ||
    Boolean(normalizedName(left.hotelName) && normalizedName(left.hotelName) === normalizedName(right.hotelName));
}
export function hotelOptionNightlyCost(option: HotelOptionQuote, occupancy: Pick<HotelSelection, 'rooms' | 'extraBeds' | 'cnb'>) {
  return occupancy.rooms * option.nightlyRate + occupancy.extraBeds * option.extraBedRate + occupancy.cnb * option.cnbRate;
}

export function hotelOptions(hotel: HotelSelection, mode: HotelOptionMode = 'single'): HotelOptionQuote[] {
  const options = [hotelOptionFromSelection(hotel)];
  if (mode === 'multiple') for (const alternative of (hotel.alternatives || []).slice(0, 2)) {
    if (!options.some((option) => sameHotelOption(option, alternative))) options.push(hotelOptionFromSelection(alternative));
  }
  return options.sort((a, b) => hotelOptionNightlyCost(a, hotel) - hotelOptionNightlyCost(b, hotel) || a.hotelName.localeCompare(b.hotelName));
}

/** Bill one complete property quote; alternative properties are never added together. */
export function effectiveHotelSelection(hotel: HotelSelection, mode: HotelOptionMode = 'single'): HotelSelection {
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

/** The same compatible inventory powers automatic suggestions and the compact selectors. */
export function hotelAlternativeCandidates(primary: HotelSelection, database: Hotel[], packageCategory: string, arrival?: string, departure?: string) {
  const primaryIsBoat = primary.accommodationType === 'houseboat' || isHouseboatHotel({ name: primary.hotelName, roomType: primary.roomType, sourceCategory: primary.category, sourceType: primary.source });
  const category = hotelOptionCategory(primary, database);
  if (!(primary.nightlyRate > 0) || !primary.hotelName.trim() || /^(?:hotel|houseboat) to be (?:added|confirmed)$/i.test(primary.hotelName.trim())) return [];
  return database.filter((hotel) => {
    if (!sameHotelDestination(hotel.destination, primary.location) || !matchesPackageCategory(hotel, packageCategory) ||
      (category !== null && hotel.normalizedCategory !== category) || isHouseboatHotel(hotel) !== primaryIsBoat ||
      hotel.id === primary.hotelId || normalizedName(hotel.name) === normalizedName(primary.hotelName) ||
      !Number.isFinite(hotel.mapB2B) || !hotel.mapB2B || hotel.mapB2B < primary.nightlyRate * 0.7 || hotel.mapB2B > primary.nightlyRate * 1.3 ||
      /unavailable|sold out|closed/i.test(hotel.availabilityStatus) || hotelRateValidity(hotel, arrival, departure) === 'outside') return false;
    return true;
  }).filter((hotel, index, records) => records.findIndex((record) => record.id === hotel.id || normalizedName(record.name) === normalizedName(hotel.name)) === index).sort((a, b) => {
    const verified = (hotel: Hotel) => hotelRateValidity(hotel, arrival, departure) === 'matching' ? 0 : 1;
    return verified(a) - verified(b) || Math.abs((a.mapB2B || 0) - primary.nightlyRate) - Math.abs((b.mapB2B || 0) - primary.nightlyRate) || a.name.localeCompare(b.name);
  });
}
