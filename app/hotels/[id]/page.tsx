import {notFound,redirect} from 'next/navigation';
import AppShell from '@/components/AppShell';
import HotelEditor from '@/components/HotelEditor';
import {isAdmin} from '@/lib/admin-auth';
import {getHotel} from '@/lib/hotel-store';
export const dynamic='force-dynamic';
export default async function HotelPage({params}:{params:Promise<{id:string}>}){if(!await isAdmin())redirect('/login?next=/hotels');const hotel=await getHotel((await params).id);if(!hotel)notFound();return <AppShell><HotelEditor initialHotel={hotel}/></AppShell>;}
