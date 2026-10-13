import {hotelDatabase,type Hotel} from '@/lib/data';
import { hotelRateValidity } from '@/lib/hotel-rate-validity';

export type PackageHotelBand='Signature'|'Signature Plus'|'Signature Premium'|'Elite';
export const packageHotelBands:PackageHotelBand[]=['Signature','Signature Plus','Signature Premium','Elite'];
export function isPackageHotelBand(value:unknown):value is PackageHotelBand{return typeof value==='string'&&packageHotelBands.includes(value as PackageHotelBand);}
export function sameHotelDestination(a:string,b:string){
  const normalize=(value:string)=>value.trim().toLowerCase().replace('sonamarg','sonmarg');
  return normalize(a)===normalize(b);
}
export function isHouseboatHotel(hotel: Partial<Pick<Hotel, 'name' | 'roomType' | 'sourceCategory' | 'sourceType'>>) {
  return /\bhouse[\s-]*boats?\b/i.test([hotel.name, hotel.roomType, hotel.sourceCategory, hotel.sourceType].filter(Boolean).join(' '));
}
const packageCategoryMap:Record<PackageHotelBand,string[]>= {
  Signature:['Budget','3 Star'],
  'Signature Plus':['3 Star Premium','3 Star Deluxe'],
  'Signature Premium':['4 Star','4 Star Deluxe','4 Star Premium'],
  Elite:['5 Star Basic','5 Star Premium','5 Star','Luxury'],
};
/** The profile's manual package band is authoritative; stars are legacy fallback only. */
export function hotelPackageCategory(hotel:Pick<Hotel,'normalizedCategory'>):PackageHotelBand|null{
  if(isPackageHotelBand(hotel.normalizedCategory))return hotel.normalizedCategory;
  return packageHotelBands.find((band)=>packageCategoryMap[band].includes(hotel.normalizedCategory))??null;
}
/** Supplier class is separate from the operator's package classification. */
export function hotelPropertyCategory(hotel:Pick<Hotel,'normalizedCategory'> & Partial<Pick<Hotel,'sourceCategory'>>):string|null{
  if(!isPackageHotelBand(hotel.normalizedCategory))return hotel.normalizedCategory==='Unspecified'?null:hotel.normalizedCategory;
  const supplier=(hotel.sourceCategory||'').trim();
  if(!supplier||isPackageHotelBand(supplier)||/^(?:unspecified|unknown|not provided)$/i.test(supplier))return null;
  const star=supplier.match(/^([3-5])\s*(?:[-–]\s*)?stars?\s*(premium|deluxe|basic)?$/i);
  if(star)return `${star[1]} Star${star[2]?` ${star[2][0].toUpperCase()}${star[2].slice(1).toLowerCase()}`:''}`;
  return supplier;
}
export function matchesPackageCategory(hotel:Pick<Hotel,'normalizedCategory'>,category:string){return !isPackageHotelBand(category)||hotelPackageCategory(hotel)===category;}
export function suggestedHotel(destination:string,category:string,hotels:Hotel[],arrival?:string,departure?:string){
  const nearby=hotels.filter((hotel)=>sameHotelDestination(hotel.destination,destination)&&
    (!isPackageHotelBand(category)||!isPackageHotelBand(hotel.normalizedCategory)||hotel.normalizedCategory===category));
  const score=(hotel:Hotel)=>{
    const availability=hotel.availabilityStatus.toLowerCase();
    const validity=hotelRateValidity(hotel,arrival,departure);
    return (matchesPackageCategory(hotel,category)?0:25)
      +(hotel.mapB2B && hotel.mapB2B>0?0:40)
      +(validity==='matching'?0:validity==='unverified'?8:35)
      +(/unavailable|sold out|closed/.test(availability)?50:0)
      +(hotel.roomType?0:2);
  };
  return [...nearby].sort((a,b)=>score(a)-score(b)||(a.mapB2B??Number.POSITIVE_INFINITY)-(b.mapB2B??Number.POSITIVE_INFINITY)||a.name.localeCompare(b.name))[0]??null;
}
export function hotelCandidates(destination:string,category:string){return hotelDatabase.filter((hotel)=>sameHotelDestination(hotel.destination,destination)&&matchesPackageCategory(hotel,category)&&(destination!=='Srinagar'||!isHouseboatHotel(hotel))).sort((a,b)=>(a.mapB2B??Number.POSITIVE_INFINITY)-(b.mapB2B??Number.POSITIVE_INFINITY)||a.name.localeCompare(b.name));}
export function firstHotelCandidate(destination:string,category:string){return hotelCandidates(destination,category)[0]??null;}
export function roomsRequired(adults:number){return Math.max(1,Math.ceil(Math.max(1,adults)/2));}
export function cnbChildren(ages:number[]){return ages.filter((age)=>age<=5).length;}
export function extraBedsRequired(ages:number[]){return ages.filter((age)=>age>5).length;}
