import {redirect} from 'next/navigation';
import {authConfigured,isAdmin} from '@/lib/admin-auth';
import LoginForm from './LoginForm';
import {loginDestination} from '@/lib/navigation';
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){const next=loginDestination((await searchParams).next);if(await isAdmin())redirect(next);return <LoginForm configured={authConfigured()} next={next}/>;}
