import {NextResponse} from 'next/server';
export const runtime='nodejs';
export async function GET(){return NextResponse.json({ok:true,product:'Chakar Experience',runtime:'nextjs-node'})}
