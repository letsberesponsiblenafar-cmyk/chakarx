import {NextResponse} from 'next/server';
import {isAdmin,sameOrigin} from '@/lib/admin-auth';
import {deleteHotel,getHotel,upsertHotels} from '@/lib/hotel-store';
import {validateHotel} from '@/lib/hotel-validation';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  try{const hotel=await getHotel((await params).id);return hotel?NextResponse.json({hotel},{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'Hotel not found.'},{status:404});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Database error.'},{status:503});}
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{const id=(await params).id;const prior=await getHotel(id);if(!prior)return NextResponse.json({error:'Hotel not found.'},{status:404});const hotel=validateHotel({...prior,...await request.json(),id},prior);await upsertHotels([hotel]);return NextResponse.json({hotel});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not update hotel.'},{status:400});}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await isAdmin())return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try{await deleteHotel((await params).id);return NextResponse.json({ok:true});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not delete hotel.'},{status:503});}
}
