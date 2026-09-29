import type {Hotel} from '@/lib/data';

export function validateHotel(value:unknown,existing?:Hotel):Hotel{
  if(!value||typeof value!=='object')throw new Error('Invalid hotel record.');
  const x=value as Record<string,unknown>;
  const str=(key:string,fallback='')=>typeof x[key]==='string'?String(x[key]).trim().slice(0,500):fallback;
  const number=(key:string,fallback:number|null)=>x[key]===null||x[key]===''?null:typeof x[key]==='number'||typeof x[key]==='string'?Number(x[key]):fallback;
  const destination=str('destination',existing?.destination);
  const name=str('name',existing?.name);
  if(!destination||!name)throw new Error('Each hotel requires a destination and name.');
  const starRating=number('starRating',existing?.starRating??null);
  if(starRating!==null&&(!Number.isInteger(starRating)||starRating<0||starRating>5))throw new Error(`${name}: stars must be from 0 to 5.`);
  const mapB2B=number('mapB2B',existing?.mapB2B??null);
  const extraBedB2B=number('extraBedB2B',existing?.extraBedB2B??null);
  const cnbB2B=number('cnbB2B',existing?.cnbB2B??null);
  for(const amount of [mapB2B,extraBedB2B,cnbB2B])if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>10000000))throw new Error(`${name}: invalid B2B rate.`);
  const website=str('website',existing?.website);
  if(website&&!/^https?:\/\//i.test(website))throw new Error(`${name}: website must start with http:// or https://.`);
  return {id:str('id',existing?.id)||crypto.randomUUID(),destination,name,sourceCategory:str('sourceCategory',existing?.sourceCategory),starRating,normalizedCategory:str('normalizedCategory',existing?.normalizedCategory||'Unspecified'),mapB2B,extraBedB2B,cnbB2B,address:str('address',existing?.address),roomType:str('roomType',existing?.roomType),website,sourceType:str('sourceType',existing?.sourceType||'Admin entry'),rateValidity:str('rateValidity',existing?.rateValidity),availabilityStatus:str('availabilityStatus',existing?.availabilityStatus),lastUpdated:new Date().toISOString().slice(0,10),sourceFiles:Array.isArray(x.sourceFiles)?x.sourceFiles.filter((v):v is string=>typeof v==='string').slice(0,20):existing?.sourceFiles||[],notes:str('notes',existing?.notes),b2bOnly:true};
}
