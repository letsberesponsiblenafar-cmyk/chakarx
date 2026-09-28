import {NextResponse} from 'next/server';
import {getPath} from 'pdf-parse/worker';
import {PDFParse} from 'pdf-parse';
import {isAdmin,sameOrigin} from '@/lib/admin-auth';
import {listHotels,upsertHotels} from '@/lib/hotel-store';
import {parseHotelPdfText} from '@/lib/hotel-pdf-import';
import {validateHotel} from '@/lib/hotel-validation';
import type {Hotel} from '@/lib/data';
export const runtime='nodejs';
PDFParse.setWorker(getPath());
export async function POST(request:Request){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{
    const form=await request.formData();const file=form.get('file');
    if(!(file instanceof File)||file.size>10*1024*1024||file.size<20||!file.name.toLowerCase().endsWith('.pdf'))throw new Error('Choose a PDF smaller than 10 MB.');
    const buffer=new Uint8Array(await file.arrayBuffer());
    if(String.fromCharCode(...buffer.slice(0,5))!=='%PDF-')throw new Error('The uploaded file is not a PDF.');
    const parser=new PDFParse({data:buffer});
    let text='';try{text=(await parser.getText()).text;}finally{await parser.destroy();}
    const parsed=parseHotelPdfText(text,await listHotels(),file.name);
    return NextResponse.json({records:parsed,count:parsed.length,creates:parsed.filter(x=>x.action==='create').length,updates:parsed.filter(x=>x.action==='update').length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not read PDF.'},{status:400});}
}
export async function PUT(request:Request){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{
    const body=await request.json();if(!Array.isArray(body.records)||body.records.length<1||body.records.length>1000)throw new Error('Invalid import batch.');
    const records=body.records.map((value:unknown)=>validateHotel((value as {hotel?:Hotel})?.hotel??value));
    if(new Set(records.map((h:Hotel)=>h.id)).size!==records.length)throw new Error('Duplicate hotel IDs in PDF.');
    await upsertHotels(records);return NextResponse.json({ok:true,count:records.length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not import hotels.'},{status:400});}
}
