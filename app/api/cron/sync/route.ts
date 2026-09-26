import {NextResponse} from 'next/server';
import {sources} from '@/lib/data';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;const provided=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||new URL(req.url).searchParams.get('secret');if(secret&&provided!==secret)return NextResponse.json({error:'Unauthorized'},{status:401});
 const results=[];for(const source of sources){const started=Date.now();try{const r=await fetch(source.url,{cache:'no-store',redirect:'follow',headers:{'User-Agent':'Chakar-Experience-Cron/1.0'}});const text=await r.text();results.push({name:source.name,status:r.status,bytes:new TextEncoder().encode(text).length,retrieved_at:new Date().toISOString(),latency_ms:Date.now()-started});}catch(e){results.push({name:source.name,status:0,bytes:0,retrieved_at:new Date().toISOString(),latency_ms:Date.now()-started,error:e instanceof Error?e.message:'failed'})}}
 return NextResponse.json({ok:true,count:results.length,results});
}
