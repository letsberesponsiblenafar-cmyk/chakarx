import {NextResponse} from 'next/server';
export const runtime='nodejs';
export const revalidate=0;
export async function GET(req:Request){
 const q=new URL(req.url).searchParams.get('q')?.trim();if(!q)return NextResponse.json({error:'Photo query is required.'},{status:400});
 try{const url=new URL('https://commons.wikimedia.org/w/api.php');url.searchParams.set('action','query');url.searchParams.set('format','json');url.searchParams.set('generator','search');url.searchParams.set('gsrsearch',q);url.searchParams.set('gsrnamespace','6');url.searchParams.set('gsrlimit','9');url.searchParams.set('prop','imageinfo');url.searchParams.set('iiprop','url');url.searchParams.set('iiurlwidth','900');url.searchParams.set('origin','*');const r=await fetch(url.toString(),{cache:'no-store',headers:{'User-Agent':'Chakar-Experience/1.0'}});if(!r.ok)throw new Error(`Wikimedia returned ${r.status}`);const data=await r.json();const pages=Object.values(data?.query?.pages||{}) as Array<any>;const photos=pages.map((p)=>({url:p.imageinfo?.[0]?.url||'',thumb:p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url||'',title:String(p.title||'').replace(/^File:/,'')})).filter(x=>x.url);return NextResponse.json({photos});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load destination photos.'},{status:502})}
}
