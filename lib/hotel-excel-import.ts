import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {inflateRawSync} from 'node:zlib';
import type {Hotel} from '@/lib/data';
import {hotelImportIdentity,mergeHotelImportRecord} from '@/lib/hotel-pdf-import';

const MAX_FILE_BYTES=10*1024*1024;
const MAX_EXPANDED_BYTES=40*1024*1024;
const MAX_SHEETS=20;
const MAX_ROWS=5000;
const MAX_COLUMNS=100;
const MAX_CELLS=100000;
const MAX_RECORDS=1000;
type ImportRecord={hotel:Hotel;action:'create'|'update'};
type RawHotel=Record<string,unknown>;
type Field=keyof Hotel;

/** Bound actual decompression before handing the ZIP to the workbook reader. */
export function checkHotelWorkbookArchive(bytes:Uint8Array){
  const buffer=Buffer.from(bytes);
  if(buffer.length<22||buffer.length>MAX_FILE_BYTES||buffer.readUInt32LE(0)!==0x04034b50)throw new Error('Choose a valid Excel .xlsx file smaller than 10 MB.');
  let end=-1;
  for(let offset=buffer.length-22;offset>=Math.max(0,buffer.length-65557);offset--){
    if(buffer.readUInt32LE(offset)===0x06054b50&&offset+22+buffer.readUInt16LE(offset+20)===buffer.length){end=offset;break;}
  }
  if(end<0)throw new Error('This Excel file is damaged or incomplete. Save it again as .xlsx.');
  const entries=buffer.readUInt16LE(end+10),directorySize=buffer.readUInt32LE(end+12),directoryStart=buffer.readUInt32LE(end+16);
  if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||buffer.readUInt16LE(end+8)!==entries||entries===0xffff||entries>500||directoryStart+directorySize!==end)throw new Error('This Excel archive is too large or uses an unsupported format.');
  let offset=directoryStart,total=0,sheets=0,cells=0;
  const names=new Set<string>();
  for(let entry=0;entry<entries;entry++){
    if(offset+46>end||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('This Excel archive is damaged.');
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),expanded=buffer.readUInt32LE(offset+24);
    const nameLength=buffer.readUInt16LE(offset+28),extraLength=buffer.readUInt16LE(offset+30),commentLength=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
    const next=offset+46+nameLength+extraLength+commentLength;
    if(next>end||compressed===0xffffffff||expanded===0xffffffff||local+30>directoryStart||buffer.readUInt32LE(local)!==0x04034b50||(flags&1)||![0,8].includes(method))throw new Error('Encrypted or unsupported Excel files cannot be imported. Save an unprotected .xlsx copy.');
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8');
    if(names.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\'))throw new Error('This Excel archive contains invalid entries.');
    names.add(name);
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if(start+compressed>directoryStart||total+expanded>MAX_EXPANDED_BYTES)throw new Error('This workbook is too large. Use at most 20 sheets and 1,000 hotels.');
    let data:Buffer;
    try{data=method===0?buffer.subarray(start,start+compressed):inflateRawSync(buffer.subarray(start,start+compressed),{maxOutputLength:Math.max(1,Math.min(expanded,MAX_EXPANDED_BYTES-total))});}
    catch{throw new Error('This workbook could not be safely read. Save a smaller .xlsx copy.');}
    if(data.length!==expanded)throw new Error('This Excel archive is damaged.');
    total+=data.length;
    if(/vbaProject\.bin$/i.test(name))throw new Error('Macro-enabled workbooks are not supported. Save a plain .xlsx copy.');
    if(/^xl\/worksheets\/[^/]+\.xml$/.test(name)){
      if(++sheets>MAX_SHEETS)throw new Error('Use a workbook with at most 20 worksheets.');
      const xml=data.toString('utf8');
      // Check sparse row/cell coordinates as well as counts before ExcelJS allocates them.
      for(const match of xml.matchAll(/<row\b[^>]*\br=["'](\d+)["']/g))if(Number(match[1])>MAX_ROWS)throw new Error('Use at most 5,000 rows per worksheet.');
      for(const match of xml.matchAll(/<c\b[^>]*\br=["']([A-Z]+)(\d+)["']/g)){
        let column=0;for(const letter of match[1])column=column*26+letter.charCodeAt(0)-64;
        if(column>MAX_COLUMNS||Number(match[2])>MAX_ROWS||++cells>MAX_CELLS)throw new Error('This workbook has too many cells. Use at most 100 columns and 100,000 cells.');
      }
    }
    offset=next;
  }
  if(offset!==end||!names.has('xl/workbook.xml')||!names.has('[Content_Types].xml')||!sheets)throw new Error('The uploaded file is not an Excel .xlsx workbook.');
}

const headerKey=(value:unknown)=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const fields:Record<string,Field>={
  id:'id',hotelid:'id',destination:'destination',location:'destination',hotel:'name',hotels:'name',name:'name',hotelname:'name',property:'name',propertyname:'name',
  category:'normalizedCategory',suppliercategory:'sourceCategory',packagecategory:'normalizedCategory',stars:'starRating',starrating:'starRating',
  map:'mapB2B',mapb2b:'mapB2B',maprate:'mapB2B',mapb2brate:'mapB2B',roomrate:'mapB2B',roomrateb2b:'mapB2B',nightlyrate:'mapB2B',
  extrabed:'extraBedB2B',extrabedb2b:'extraBedB2B',extrabedrate:'extraBedB2B',cnb:'cnbB2B',cnbb2b:'cnbB2B',cnbrate:'cnbB2B',
  address:'address',roomtype:'roomType',website:'website',ratevalidity:'rateValidity',availability:'availabilityStatus',availabilitystatus:'availabilityStatus',notes:'notes',
};
const numericFields=new Set<Field>(['mapB2B','extraBedB2B','cnbB2B','starRating']);
const destinationNames=['Srinagar','Pahalgam','Gulmarg','Sonamarg','Doodhpathri','Gurez','Naranag','Yusmarg','Aharbal','Dachigam'];
function destinationIn(value:string){
  const text=value.toLowerCase().replace(/sonmarg/g,'sonamarg').replace(/doodpathri/g,'doodhpathri');
  return destinationNames.find((name)=>new RegExp(`\\b${name.toLowerCase()}\\b`).test(text));
}
function cellValue(value:ExcelJS.CellValue):unknown{
  if(value===null||value===undefined)return '';
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==='object'){
    if('formula' in value||'sharedFormula' in value){
      if(!('result' in value)||value.result===undefined)throw new Error('A formula has no saved result. Open the workbook in Excel, recalculate and save before uploading.');
      return cellValue(value.result as ExcelJS.CellValue);
    }
    if('error' in value)throw new Error('A worksheet contains an Excel formula error. Correct it before uploading.');
    if('richText' in value)return value.richText.map((part)=>part.text).join('');
    if('text' in value)return value.text;
  }
  return value;
}
function amount(value:unknown,label:string){
  if(value===''||value===null||value===undefined)return null;
  if(typeof value==='number')return value;
  const raw=String(value).trim();
  if(/^(?:-|–|—|n\/?a|not available|on request|tba|tbc)$/i.test(raw))return null;
  const clean=raw.replace(/^(?:₹|rs\.?|inr)\s*/i,'').replace(/\s*(?:\/-|₹|rs\.?|inr)$/i,'').replace(/,/g,'').trim();
  if(!/^-?\d+(?:\.\d+)?$/.test(clean))throw new Error(`${label}: enter one numeric rate, not a range or text.`);
  return Number(clean);
}
function categoryFields(label:string){
  const star=label.match(/\b([1-5])\s*stars?\b/i);
  const detail=label.match(/\b(premium|deluxe|basic)\b/i)?.[1];
  const normalized=star?`${star[1]} Star${detail?` ${detail[0].toUpperCase()}${detail.slice(1).toLowerCase()}`:''}`:/\bbudget\b/i.test(label)?'Budget':label.trim()||'Unspecified';
  return {sourceCategory:normalized,normalizedCategory:normalized,...(star?{starRating:Number(star[1])}:{})};
}
function setField(record:RawHotel,field:Field,value:unknown,label:string){
  if(numericFields.has(field))record[field]=amount(value,label);
  else if(value!==''&&value!==null&&value!==undefined)record[field]=String(value).trim();
}
function isHotelHeader(values:unknown[]){
  const populated=values.filter((value)=>value!==''&&value!==null&&value!==undefined);
  const mapped=populated.map((value)=>fields[headerKey(value)]).filter(Boolean);
  return mapped.includes('name')&&(mapped.length>=2||populated.length===1);
}

// Some spreadsheet producers use an explicit namespace prefix. ExcelJS expects
// the equivalent default namespace, so normalize XML element names only.
async function workbookReaderBytes(bytes:Uint8Array){
  const zip=await JSZip.loadAsync(bytes);
  let changed=false;
  for(const entry of Object.values(zip.files)){
    if(entry.dir||!/^xl\/.*\.xml$/.test(entry.name))continue;
    const xml=await entry.async('string');
    const namespace='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const declaration=xml.match(/xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/);
    if(!declaration)continue;
    const prefix=declaration[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const normalized=xml.replace(new RegExp(`<(/?)${prefix}:`,'g'),'<$1').replace(declaration[0],`xmlns="${namespace}"`);
    zip.file(entry.name,normalized);changed=true;
  }
  return changed?await zip.generateAsync({type:'nodebuffer',compression:'STORE'}):Buffer.from(bytes);
}

export function validateHotelImportBatch(values:unknown[],existing:Hotel[]):Hotel[]{
  const byId=new Map(existing.map((hotel)=>[hotel.id,hotel]));
  const byName=new Map(existing.map((hotel)=>[hotelImportIdentity(hotel.destination,hotel.name),hotel]));
  const ids=new Set<string>(),names=new Set<string>();
  return values.map((value,index)=>{
    const wrapped=value as {hotel?:unknown};
    const record=(wrapped?.hotel??value) as RawHotel;
    if(!record||typeof record!=='object'||Array.isArray(record))throw new Error(`Invalid hotel at record ${index+1}.`);
    const prior=byId.get(String(record.id??''))||byName.get(hotelImportIdentity(record.destination,record.name));
    const filename=Array.isArray(record.sourceFiles)&&typeof record.sourceFiles[0]==='string'?record.sourceFiles[0]:'Hotel import';
    const hotel=mergeHotelImportRecord(record,prior,filename,record.sourceType==='Excel import'?'Excel import':'PDF import');
    const identity=hotelImportIdentity(hotel.destination,hotel.name);
    if(ids.has(hotel.id)||names.has(identity))throw new Error(`Duplicate hotel at record ${index+1}: ${hotel.name}.`);
    ids.add(hotel.id);names.add(identity);return hotel;
  });
}

export async function parseHotelExcel(bytes:Uint8Array,existing:Hotel[],filename:string):Promise<ImportRecord[]>{
  if(!/\.xlsx$/i.test(filename))throw new Error('Choose an Excel .xlsx file. Older .xls files must be saved as .xlsx first.');
  checkHotelWorkbookArchive(bytes);
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(await workbookReaderBytes(bytes) as unknown as ExcelJS.Buffer);}
  catch{throw new Error('Could not read this Excel workbook. Save it again as .xlsx and retry.');}
  const rawRecords:RawHotel[]=[];
  const add=(record:RawHotel,label:string)=>{
    if(!record.name)return;
    if(!record.destination)throw new Error(`${label}: destination is missing. Add a Destination column or put the destination in the sheet name.`);
    if(rawRecords.length>=MAX_RECORDS)throw new Error('Import at most 1,000 hotels at a time.');
    rawRecords.push(record);
  };
  for(const sheet of workbook.worksheets){
    if(sheet.rowCount>MAX_ROWS||sheet.columnCount>MAX_COLUMNS)throw new Error('Use at most 5,000 rows and 100 columns per worksheet.');
    const rows:{number:number;values:unknown[]}[]=[];
    sheet.eachRow((row,number)=>{const values:unknown[]=[];row.eachCell((cell,column)=>{values[column]=cellValue(cell.value);});if(values.some((value)=>value!==''&&value!==undefined))rows.push({number,values});});
    if(!rows.length)continue;
    let fallbackDestination=destinationIn(sheet.name)||destinationIn(rows.slice(0,10).flatMap((row)=>row.values).filter(Boolean).join(' '))||destinationIn(filename);
    let recognized=false;
    for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
      const row=rows[rowIndex];
      const columnFields=new Map<number,Field>();row.values.forEach((value,column)=>{const field=fields[headerKey(value)];if(field)columnFields.set(column,field);});
      if(isHotelHeader(row.values)){
        recognized=true;
        for(let next=rowIndex+1;next<rows.length;next++){
          const values=rows[next].values;
          if(isHotelHeader(values)){rowIndex=next-1;break;}
          const nameColumn=[...columnFields].find(([,field])=>field==='name')![0];
          if(!values[nameColumn])continue;
          const label=`${sheet.name}, row ${rows[next].number}`;
          const record:RawHotel={destination:fallbackDestination};
          columnFields.forEach((field,column)=>setField(record,field,values[column],label));
          if(record.normalizedCategory&&!record.sourceCategory)record.sourceCategory=record.normalizedCategory;
          if(record.sourceCategory&&!record.normalizedCategory)Object.assign(record,categoryFields(String(record.sourceCategory)));
          if(record.starRating===undefined&&record.normalizedCategory)Object.assign(record,{starRating:categoryFields(String(record.normalizedCategory)).starRating??null});
          add(record,label);
          rowIndex=next;
        }
        continue;
      }
      const groups:{column:number;category:string;destination?:string}[]=[];
      row.values.forEach((value,column)=>{
        const text=String(value??'').trim();
        if(/\bbudget\b|\b[1-5]\s*stars?\b|^signature(?: plus| premium)?$|^elite$/i.test(text))groups.push({column,category:text,destination:destinationIn(text)});
      });
      if(groups.length){
        recognized=true;
        fallbackDestination=groups.find((group)=>group.destination)?.destination||fallbackDestination;
        for(let next=rowIndex+1;next<rows.length;next++){
          const values=rows[next].values;
          // A second category header starts a fresh table, rather than becoming a hotel.
          if(values.some((value)=>/\bbudget hotels\b|\b[1-5]\s*star(?:s)?\s*(?:deluxe|premium|basic|hotels)?$/i.test(String(value??'')))){rowIndex=next-1;break;}
          for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
            const group=groups[groupIndex],name=values[group.column];
            if(name===undefined||name===null||String(name).trim()==='')continue;
            const label=`${sheet.name}, row ${rows[next].number}`;
            const record:RawHotel={name:String(name).trim(),destination:group.destination||fallbackDestination,...categoryFields(group.category)};
            const end=groups[groupIndex+1]?.column??Math.max(row.values.length,values.length);
            for(let column=group.column+1;column<end;column++){
              const field=fields[headerKey(row.values[column])];
              if(field&&numericFields.has(field))setField(record,field,values[column],label);
            }
            add(record,label);
          }
          rowIndex=next;
        }
      }
    }
    // Original Doodhpathri/Gurez supplier sheets contain a destination title and names only.
    if(!recognized&&rows.length>1&&destinationIn(String(rows[0].values.filter(Boolean).join(' ')))&&rows.every((row)=>row.values.filter((value)=>value!==''&&value!==undefined).length===1)){
      for(const row of rows.slice(1))add({name:String(row.values.find((value)=>value!==''&&value!==undefined)).trim(),destination:fallbackDestination},`${sheet.name}, row ${row.number}`);
      recognized=true;
    }
    if(!recognized&&rows.length>1)throw new Error(`${sheet.name}: no hotel table was recognised. Use Hotel and Destination headers or the supplied category-and-rate layout.`);
  }
  if(!rawRecords.length)throw new Error('No hotels found. Add a Hotel column and a Destination column or destination sheet name.');
  const byId=new Map(existing.map((hotel)=>[hotel.id,hotel]));
  const byName=new Map(existing.map((hotel)=>[hotelImportIdentity(hotel.destination,hotel.name),hotel]));
  const identities=new Set<string>(),ids=new Set<string>();
  return rawRecords.map((record,index)=>{
    const prior=byId.get(String(record.id??''))||byName.get(hotelImportIdentity(record.destination,record.name));
    const hotel=mergeHotelImportRecord(record,prior,filename,'Excel import');
    const identity=hotelImportIdentity(hotel.destination,hotel.name);
    if(identities.has(identity)||ids.has(hotel.id))throw new Error(`Duplicate hotel at record ${index+1}: ${hotel.name}. Keep one row per destination and hotel.`);
    identities.add(identity);ids.add(hotel.id);
    return {hotel,action:prior?'update':'create'};
  });
}
