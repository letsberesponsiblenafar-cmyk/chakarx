import {NextResponse} from 'next/server';
import {getPath} from 'pdf-parse/worker';
import {PDFParse} from 'pdf-parse';
import {isAdmin,sameOrigin} from '@/lib/admin-auth';
import {listHotels,upsertHotels} from '@/lib/hotel-store';
import {parseHotelPdfText} from '@/lib/hotel-pdf-import';
import {parseHotelExcel,validateHotelImportBatch} from '@/lib/hotel-excel-import';
export const runtime='nodejs';
PDFParse.setWorker(getPath());
export async function POST(request:Request){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{
    let text='';let sourceName='Pasted hotel master text';
    const existing=await listHotels();
    let parsed;
    if(request.headers.get('content-type')?.includes('application/json')){
      const body=await request.json();
      if(typeof body.text!=='string'||body.text.length<20||body.text.length>500_000)throw new Error('Paste hotel record text under 500 KB.');
      text=body.text;
    }else{
      const form=await request.formData();const file=form.get('file');
      if(!(file instanceof File)||file.size>10*1024*1024||file.size<20||!/\.(?:pdf|xlsx)$/i.test(file.name))throw new Error('Choose a PDF or Excel .xlsx file smaller than 10 MB. Save older .xls files as .xlsx first.');
      const buffer=new Uint8Array(await file.arrayBuffer());
      sourceName=file.name;
      if(/\.xlsx$/i.test(file.name))parsed=await parseHotelExcel(buffer,existing,sourceName);
      else{
        if(String.fromCharCode(...buffer.slice(0,5))!=='%PDF-')throw new Error('The uploaded file is not a PDF.');
        const parser=new PDFParse({data:buffer});
        try{text=(await parser.getText()).text;}finally{await parser.destroy();}
      }
    }
    parsed??=parseHotelPdfText(text,existing,sourceName);
    return NextResponse.json({records:parsed,count:parsed.length,creates:parsed.filter(x=>x.action==='create').length,updates:parsed.filter(x=>x.action==='update').length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not read the hotel file.'},{status:400});}
}
export async function PUT(request:Request){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{
    const body=await request.json();if(!Array.isArray(body.records)||body.records.length<1||body.records.length>1000)throw new Error('Invalid import batch.');
    // Recheck the current master at apply time: a preview must never undo a
    // package category that another operator saved after that preview.
    const records=validateHotelImportBatch(body.records,await listHotels());
    await upsertHotels(records);return NextResponse.json({ok:true,count:records.length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not import hotels.'},{status:400});}
}
