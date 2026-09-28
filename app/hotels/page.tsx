import AppShell from '@/components/AppShell';
import HotelDashboard from '@/components/HotelDashboard';
import {hotelStoreConfigured,listHotels} from '@/lib/hotel-store';
import {isAdmin} from '@/lib/admin-auth';
import {redirect} from 'next/navigation';
import type {Hotel} from '@/lib/data';
export const dynamic='force-dynamic';
export default async function HotelsPage(){
  if(!await isAdmin())redirect('/login?next=/hotels');
  const configured=hotelStoreConfigured();let hotels:Hotel[]=[];let error='';
  try{hotels=configured?await listHotels():[];}catch(e){error=e instanceof Error?e.message:'Could not reach the database.';}
  return <AppShell><HotelDashboard initialHotels={hotels} configured={configured} error={error}/></AppShell>;
}
