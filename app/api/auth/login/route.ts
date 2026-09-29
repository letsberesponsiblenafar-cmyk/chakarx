import {NextResponse} from 'next/server';
import {authConfigured,createSession,sameOrigin,SESSION_COOKIE,verifyPassword} from '@/lib/admin-auth';
export const runtime='nodejs';
const attempts=new Map<string,{count:number;until:number}>();
export async function POST(request:Request){
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  if(!authConfigured())return NextResponse.json({error:'Admin access has not been configured yet.'},{status:503});
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';
  const state=attempts.get(ip);
  if(state&&state.count>=5&&state.until>Date.now())return NextResponse.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
  const body=await request.json().catch(()=>null);
  const user=String(body?.username||'');const password=String(body?.password||'');
  if(!verifyPassword(user,password)){
    attempts.set(ip,{count:(state?.until&&state.until>Date.now()?state.count:0)+1,until:Date.now()+15*60*1000});
    return NextResponse.json({error:'Incorrect username or password.'},{status:401});
  }
  attempts.delete(ip);
  const response=NextResponse.json({ok:true});
  response.cookies.set(SESSION_COOKIE,createSession(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:8*60*60});
  return response;
}
