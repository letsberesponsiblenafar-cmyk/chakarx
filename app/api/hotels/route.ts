import {NextResponse} from 'next/server';
import {hotelDatabase} from '@/lib/data';
export const runtime='nodejs';
export async function GET(){
  return NextResponse.json({
    ok:true,
    updatedAt:new Date().toISOString(),
    sourceValidity:'October 2026',
    count:hotelDatabase.length,
    note:'Rates are the supplied internal B2B spreadsheet snapshot. Live room availability requires a dated supplier/provider query.',
    hotels:hotelDatabase,
  },{headers:{'Cache-Control':'no-store'}});
}
