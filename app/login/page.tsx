import {redirect} from 'next/navigation';
import {authConfigured,isAdmin} from '@/lib/admin-auth';
import LoginForm from './LoginForm';
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){if(await isAdmin())redirect('/hotels');return <LoginForm configured={authConfigured()} next={(await searchParams).next}/>;}
