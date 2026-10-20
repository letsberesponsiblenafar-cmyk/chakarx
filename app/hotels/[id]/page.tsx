import {notFound,redirect} from 'next/navigation';
import AppShell from '@/components/AppShell';
import HotelEditor from '@/components/HotelEditor';
import {isAdmin} from '@/lib/admin-auth';
import {getHotel} from '@/lib/hotel-store';
export const dynamic='force-dynamic';
export default async function HotelPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!await isAdmin())redirect(`/login?next=${encodeURIComponent(`/hotels/${encodeURIComponent(id)}`)}`);const hotel=await getHotel(id);if(!hotel)notFound();return <AppShell><HotelEditor key={hotel.id} initialHotel={hotel}/></AppShell>;}
