import AppShell from '@/components/AppShell';
import HotelEditor from '@/components/HotelEditor';
import {isAdmin} from '@/lib/admin-auth';
import {redirect} from 'next/navigation';
export default async function NewHotelPage(){if(!await isAdmin())redirect('/login?next=/hotels/new');return <AppShell><HotelEditor/></AppShell>;}
