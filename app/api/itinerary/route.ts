import {NextResponse} from 'next/server';
import {createPlan} from '@/lib/itinerary';
export const runtime='nodejs';
export async function POST(req:Request){try{const body=await req.json();if(!body?.input)return NextResponse.json({error:'Trip input is required.'},{status:400});const plan=createPlan(body.input);return NextResponse.json({plan})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not create itinerary.'},{status:400})}}
