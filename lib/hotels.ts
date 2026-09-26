import {hotelDatabase,type Hotel} from '@/lib/data';

export type PackageHotelBand='Signature'|'Signature Plus'|'Signature Premium'|'Elite';
const packageCategoryMap:Record<PackageHotelBand,string[]>= {
  Signature:['3 Star','3 Star Deluxe'],
  'Signature Plus':['3 Star','3 Star Premium','3 Star Deluxe'],
  'Signature Premium':['4 Star','4 Star Deluxe','4 Star Premium'],
  Elite:['5 Star Basic','5 Star Premium','5 Star','Luxury'],
};
export function matchesPackageCategory(hotel:Hotel,category:string){const allowed=packageCategoryMap[category as PackageHotelBand];return allowed?allowed.includes(hotel.normalizedCategory):true;}
export function hotelCandidates(destination:string,category:string){return hotelDatabase.filter((hotel)=>hotel.destination===destination&&matchesPackageCategory(hotel,category)).sort((a,b)=>(a.mapB2B??Number.POSITIVE_INFINITY)-(b.mapB2B??Number.POSITIVE_INFINITY)||a.name.localeCompare(b.name));}
export function firstHotelCandidate(destination:string,category:string){return hotelCandidates(destination,category)[0]??hotelDatabase.find((hotel)=>hotel.destination===destination)??null;}
export function roomsRequired(adults:number){return Math.max(1,Math.ceil(Math.max(1,adults)/2));}
export function cnbChildren(ages:number[]){return ages.filter((age)=>age<=5).length;}
export function extraBedsRequired(ages:number[]){return ages.filter((age)=>age>5).length;}
