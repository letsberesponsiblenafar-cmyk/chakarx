import {NextResponse} from 'next/server';
import {sameOrigin,SESSION_COOKIE} from '@/lib/admin-auth';
export async function POST(request:Request){
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  const response=NextResponse.json({ok:true});response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,path:'/',maxAge:0});return response;
}
