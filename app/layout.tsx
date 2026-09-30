import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import './globals.css';
import {PlannerProvider} from '@/components/PlannerProvider';
export const metadata:Metadata={title:'Chakar Experience — Kashmir Travel Planner',description:'Chakar Experience creates detailed Kashmir travel itineraries, hotel plans, costing and client-ready travel documents.',icons:{icon:[{url:'/chakar-favicon-ink.png',type:'image/png',sizes:'215x215'},{url:'/chakar-favicon-white.png',type:'image/png',sizes:'215x215',media:'(prefers-color-scheme: dark)'}]}};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body><PlannerProvider>{children}</PlannerProvider></body></html>}
