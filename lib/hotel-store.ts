import 'server-only';
import type {Hotel} from '@/lib/data';

type Row={id:string;destination:string;name:string;source_category:string|null;star_rating:number|null;normalized_category:string|null;map_b2b:number|null;extra_bed_b2b:number|null;cnb_b2b:number|null;address:string|null;room_type:string|null;website:string|null;source_type:string|null;rate_validity:string|null;availability_status:string|null;last_updated:string|null;notes:string|null;source_files:string[]|null};
const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
export function hotelStoreConfigured(){return Boolean(url&&key);}
function toHotel(r:Row):Hotel{return {id:r.id,destination:r.destination,name:r.name,sourceCategory:r.source_category||'',starRating:r.star_rating,normalizedCategory:r.normalized_category||'Unspecified',mapB2B:r.map_b2b,extraBedB2B:r.extra_bed_b2b,cnbB2B:r.cnb_b2b,address:r.address||'',roomType:r.room_type||'',website:r.website||'',sourceType:r.source_type||'',rateValidity:r.rate_validity||'',availabilityStatus:r.availability_status||'',lastUpdated:r.last_updated||'',notes:r.notes||'',sourceFiles:r.source_files||[],b2bOnly:true};}
function toRow(h:Hotel):Row{return {id:h.id,destination:h.destination,name:h.name,source_category:h.sourceCategory,star_rating:h.starRating,normalized_category:h.normalizedCategory,map_b2b:h.mapB2B,extra_bed_b2b:h.extraBedB2B,cnb_b2b:h.cnbB2B,address:h.address,room_type:h.roomType,website:h.website,source_type:h.sourceType,rate_validity:h.rateValidity,availability_status:h.availabilityStatus,last_updated:h.lastUpdated||new Date().toISOString().slice(0,10),notes:h.notes,source_files:h.sourceFiles};}
async function call(path:string,init:RequestInit={}){
  if(!url||!key)throw new Error('Hotel database is not connected. Add SUPABASE_URL and SUPABASE_SECRET_KEY.');
  try{const parsed=new URL(url);if(parsed.protocol!=='https:')throw new Error();}catch{throw new Error('SUPABASE_URL must be the project URL, for example https://project.supabase.co.');}
  const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
  // The current sb_secret_ keys are API keys, not JWTs. Only legacy service-role
  // JWTs belong in the Authorization header.
  if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
  const read=!(init.method&&init.method!=='GET');
  for(let attempt=0;attempt<(read?2:1);attempt++){
    try{
      const response=await fetch(`${url}/rest/v1/hotel_master${path}`,{...init,headers:{...headers,...init.headers},cache:'no-store',signal:AbortSignal.timeout(6000)});
      if(!response.ok){
        if(read&&attempt===0&&[429,502,503,504].includes(response.status)){await new Promise((resolve)=>setTimeout(resolve,350));continue;}
        throw new Error(`Hotel database request failed (${response.status}): ${(await response.text()).slice(0,180)}`);
      }
      const body=await response.text();return body?JSON.parse(body):null;
    }catch(error){
      if(!read||attempt>0||error instanceof Error&&error.message.startsWith('Hotel database request failed'))throw error;
      await new Promise((resolve)=>setTimeout(resolve,350));
    }
  }
  throw new Error('Hotel database did not respond.');
}
export async function listHotels():Promise<Hotel[]>{return (await call('?select=*&order=destination.asc,name.asc&limit=1000') as Row[]).map(toHotel);}
export async function getHotel(id:string):Promise<Hotel|null>{const rows=await call(`?select=*&id=eq.${encodeURIComponent(id)}&limit=1`) as Row[];return rows[0]?toHotel(rows[0]):null;}
export async function upsertHotels(hotels:Hotel[]){
  if(!hotels.length)return;
  await call('?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(hotels.map(toRow))});
}
export async function deleteHotel(id:string){await call(`?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});}
