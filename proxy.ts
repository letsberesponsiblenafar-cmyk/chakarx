import {NextRequest,NextResponse} from 'next/server';
import {SESSION_COOKIE,validSession} from '@/lib/admin-auth';

export function proxy(request:NextRequest){
  const path=request.nextUrl.pathname;
  if(path==='/login'||path==='/api/auth/login'||path==='/api/health'||path.startsWith('/_next/')||path==='/favicon.ico'||/\.(?:png|jpg|jpeg|svg|webp|woff2?)$/i.test(path))return NextResponse.next();
  if(validSession(request.cookies.get(SESSION_COOKIE)?.value))return NextResponse.next();
  if(path.startsWith('/api/'))return NextResponse.json({error:'Admin sign-in required.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const login=new URL('/login',request.url);login.searchParams.set('next',path);
  return NextResponse.redirect(login);
}
export const config={matcher:['/((?!_next/static|_next/image).*)']};
