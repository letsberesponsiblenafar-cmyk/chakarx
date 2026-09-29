import type {Hotel} from '@/lib/data';
import {validateHotel} from '@/lib/hotel-validation';

const labels:Record<string,keyof Hotel>={
  id:'id',destination:'destination',location:'destination',hotel:'name',name:'name',category:'normalizedCategory',stars:'starRating',
  'map b2b':'mapB2B','map rate':'mapB2B','extra bed b2b':'extraBedB2B','extra bed':'extraBedB2B','cnb b2b':'cnbB2B',cnb:'cnbB2B',
  address:'address','room type':'roomType',website:'website','rate validity':'rateValidity','availability status':'availabilityStatus',notes:'notes',
};
const numeric=new Set<keyof Hotel>(['starRating','mapB2B','extraBedB2B','cnbB2B']);
export function parseHotelPdfText(text:string,existing:Hotel[],filename:string){
  const records:Record<string,unknown>[]=[];let current:Record<string,unknown>|null=null;
  const finish=()=>{if(current&&Object.keys(current).length)records.push(current);current=null;};
  for(const line of text.split(/\r?\n/)){
    const trimmed=line.trim();
    if(/^CHAKAR HOTEL RECORD\b/i.test(trimmed)){finish();current={};continue;}
    if(/^END HOTEL\b/i.test(trimmed)){finish();continue;}
    const match=trimmed.match(/^([A-Za-z][A-Za-z0-9 ]{0,30}):\s*(.*)$/);
    if(!match)continue;
    const field=labels[match[1].trim().toLowerCase()];if(!field)continue;
    if(field==='name'&&current?.name)finish();
    current??={};
    const raw=match[2].trim();
    if(numeric.has(field))current[field]=raw?Number(raw.replace(/[^\d.-]/g,'')):null;
    else current[field]=raw;
  }
  finish();
  if(!records.length)throw new Error('No hotel records found. Use the CHAKAR HOTEL RECORD format shown in the import guide. Scanned-image PDFs need OCR before upload.');
  const byId=new Map(existing.map(h=>[h.id,h]));
  const byName=new Map(existing.map(h=>[`${h.destination}|${h.name}`.toLowerCase(),h]));
  const found=new Set<string>();
  return records.map((record,index)=>{
    const prior=(record.id?byId.get(String(record.id)):undefined)||byName.get(`${record.destination}|${record.name}`.toLowerCase());
    const merged={...prior,...record,sourceType:'PDF import',sourceFiles:[filename]};
    const hotel=validateHotel(merged,prior);
    if(found.has(hotel.id))throw new Error(`Duplicate hotel at record ${index+1}: ${hotel.name}.`);
    found.add(hotel.id);
    return {hotel,action:prior?'update' as const:'create' as const};
  });
}
