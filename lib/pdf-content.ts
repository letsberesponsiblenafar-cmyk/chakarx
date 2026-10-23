import type { HotelSelection } from '@/components/PlannerProvider';
import type { Plan, TripInput } from '@/lib/itinerary';
import { activeHotelSelections, hotelNightNumbers, hotelStayType } from '@/lib/accommodation';
import { hotelOptionNames } from '@/lib/hotel-options';

// Shared client-facing data only. Themes must never recalculate the quote.
export function pdfHotelName(hotel: HotelSelection, input: Pick<TripInput,'hotelOptionMode'>) {
  const names = hotelOptionNames(hotel,input.hotelOptionMode);
  return `${names.join(' / ') || 'Hotel to be confirmed'}${input.hotelOptionMode === 'multiple' && names.length > 1 ? ' or similar' : ''}`;
}

export function pdfHotelLocation(_hotels: HotelSelection[], hotel: HotelSelection) {
  return hotelStayType(hotel) === 'houseboat' ? 'Houseboats' : hotel.location;
}

export function pdfHotels(plan: Plan, selections: HotelSelection[], input: TripInput): HotelSelection[] {
  const active = activeHotelSelections(plan, selections);
  return plan.hotelPlans.flatMap((row)=>{
    const existing=active.filter((hotel)=>hotel.location===row.location).sort((a,b) => Number(hotelStayType(a) === 'houseboat') - Number(hotelStayType(b) === 'houseboat'));
    if (existing.length) return existing.map((hotel) => ({ ...hotel, nights: hotelNightNumbers(plan,hotel).length }));
    return [{
      location:row.location,hotelId:'',hotelName:'Hotel to be confirmed',category:input.hotelCategory,starRating:null,address:'',roomType:'',website:'',nights:row.nights,rooms:1,extraBeds:0,cnb:0,nightlyRate:0,extraBedRate:0,cnbRate:0,source:'',status:'',
    }];
  });
}
