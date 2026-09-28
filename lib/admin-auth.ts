import 'server-only';
import {createHmac, scryptSync, timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';

export const SESSION_COOKIE='chakar_admin';
const SESSION_SECONDS=8*60*60;

export function authConfigured(){return Boolean(process.env.CHAKAR_ADMIN_USER&&process.env.CHAKAR_ADMIN_PASSWORD_HASH&&process.env.CHAKAR_SESSION_SECRET&&process.env.CHAKAR_SESSION_SECRET.length>=32);}

export function verifyPassword(user:string,password:string){
  const expectedUser=process.env.CHAKAR_ADMIN_USER||'';
  const [salt,expectedHex]=(process.env.CHAKAR_ADMIN_PASSWORD_HASH||'').split(':');
  if(!authConfigured()||!salt||!expectedHex||user!==expectedUser)return false;
  const actual=scryptSync(password,salt,32);
  const expected=Buffer.from(expectedHex,'hex');
  return expected.length===actual.length&&timingSafeEqual(actual,expected);
}

function sign(payload:string){return createHmac('sha256',process.env.CHAKAR_SESSION_SECRET||'').update(payload).digest('hex');}
export function createSession(){const payload=String(Math.floor(Date.now()/1000)+SESSION_SECONDS);return `${payload}.${sign(payload)}`;}
export function validSession(token?:string){
  if(!token||!authConfigured())return false;
  const [payload,signature]=token.split('.');
  if(!payload||!signature||!/^\d+$/.test(payload)||Number(payload)<Date.now()/1000)return false;
  const actual=Buffer.from(signature,'hex');const expected=Buffer.from(sign(payload),'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function isAdmin(){return validSession((await cookies()).get(SESSION_COOKIE)?.value);}
export function sameOrigin(request:Request){try{const origin=request.headers.get('origin');return !!origin&&new URL(origin).host===new URL(request.url).host;}catch{return false;}}
