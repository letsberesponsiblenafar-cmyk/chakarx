import {NextResponse} from 'next/server';
import {sources} from '@/lib/data';
export const runtime='nodejs';
export async function GET(req:Request){
 const index=Number(new URL(req.url).searchParams.get('source'));if(!Number.isInteger(index)||!sources[index])return NextResponse.json({error:'Unknown source.'},{status:400});
 const source=sources[index];const started=Date.now();
 try{const r=await fetch(source.url,{cache:'no-store',redirect:'follow',headers:{'User-Agent':'Chakar-Experience-Source-Check/1.0'}});const text=await r.text();const checksum=await sha256(text);return NextResponse.json({source:source.name,status:r.status,retrieved_at:new Date().toISOString(),bytes:new TextEncoder().encode(text).length,hash:checksum,latency_ms:Date.now()-started,url:source.url});}
 catch(e){return NextResponse.json({source:source.name,status:0,retrieved_at:new Date().toISOString(),bytes:0,hash:null,latency_ms:Date.now()-started,url:source.url,error:e instanceof Error?e.message:'Network check failed'},{status:502})}
}
async function sha256(value:string){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')}
