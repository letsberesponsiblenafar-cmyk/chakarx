import {NextResponse} from 'next/server';
import {isAdmin,sameOrigin} from '@/lib/admin-auth';
import {hotelStoreConfigured,listHotels,upsertHotels} from '@/lib/hotel-store';
import {validateHotel} from '@/lib/hotel-validation';
export const runtime='nodejs';
export async function GET(){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  try{const hotels=hotelStoreConfigured()?await listHotels():[];return NextResponse.json({hotels,count:hotels.length,configured:hotelStoreConfigured()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Database error.'},{status:503});}
}
export async function POST(request:Request){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{const hotel=validateHotel(await request.json());await upsertHotels([hotel]);return NextResponse.json({hotel},{status:201});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not save hotel.'},{status:400});}
}
