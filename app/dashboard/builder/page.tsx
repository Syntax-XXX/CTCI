'use client'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import ChatBuilderEditor from '@/components/ChatBuilderEditor'
import { createClient } from '@/lib/supabase/client'
export default function BuilderPage(){const router=useRouter();async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}return <><DashboardNav onSignOut={signOut}/><main className="app-main"><section className="dashboard-hero"><div><h1>Visual Chat Builder <span className="small">BETA</span></h1><p>Make your OBS chat look different for every streamer: custom username plates, glass message bubbles, uploaded decorations, symbols, badges, spacing and layout — no code required.</p></div><div className="hero-status"><div><strong>Per-streamer design</strong><span>Safe validated builder config · Realtime OBS updates</span></div></div></section><ChatBuilderEditor/></main></>}
