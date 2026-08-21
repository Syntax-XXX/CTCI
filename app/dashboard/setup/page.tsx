'use client'

import { useEffect,useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

type Step={name:string;done:boolean;detail:string;href?:string;action?:string}
export default function SetupWizard(){
  const router=useRouter(),[steps,setSteps]=useState<Step[]>([]),[status,setStatus]=useState('Checking setup…')
  useEffect(()=>{void load()},[])
  async function load(){const sb=createClient(),{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}const features=await fetch('/api/features',{cache:'no-store'}),fb=await features.json().catch(()=>({}));if(!features.ok||fb.flags?.setup_wizard!==true){setStatus('Setup Wizard is disabled in Feature Center.');return}const[sources,openai]=await Promise.all([fetch('/api/chat/sources',{cache:'no-store'}),fetch('/api/settings/openai',{cache:'no-store'})]),s=await sources.json().catch(()=>({})),o=await openai.json().catch(()=>({}));let discord=false;try{const d=await fetch('/api/discord/channels',{cache:'no-store'});discord=d.ok}catch{}const overlay=await sb.from('overlays').select('slug').eq('user_id',user.id).single();setSteps([
    {name:'Twitch',done:true,detail:'Your current CTCI login is connected through Twitch OAuth.',href:'/dashboard'},
    {name:'YouTube',done:s.youtube_connected===true,detail:s.youtube_connected?`Connected${s.youtube_oauth_channel_title?` to ${s.youtube_oauth_channel_title}`:''}.`:'Connect once for automatic live chat discovery.',href:'/api/youtube/connect'},
    {name:'Discord',done:discord,detail:discord?'Discord bot connection is available.':'Install the CTCI Discord bot if you want role sync and chat relay.',href:'/api/discord/connect'},
    {name:'OBS Browser Source',done:!!overlay.data?.slug,detail:overlay.data?.slug?`Use /overlay/${overlay.data.slug} as your browser source.`:'Overlay slug is not available yet.',href:'/dashboard'},
    {name:'OpenAI (optional)',done:o.configured===true,detail:o.configured?`BYOK key saved ••••${o.last4||''}.`:'Only needed for AI features.',href:'/dashboard/features'},
  ]);setStatus('Setup check complete.')}
  async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}
  return <><DashboardNav onSignOut={signOut}/><main className="app-main"><section className="dashboard-hero"><div><span className="eyebrow">SETUP WIZARD · BETA</span><h1>Connect once, then stream.</h1><p>CTCI checks the services that power your enabled workflow without exposing any credentials.</p></div><div className="hero-status"><div><strong>{steps.filter(s=>s.done).length}/{steps.length||5} ready</strong><span>{status}</span></div></div></section><section className="panel"><div className="setup-grid">{steps.map((step,index)=><article className={`setup-card ${step.done?'done':''}`} key={step.name}><div className="setup-index">{step.done?'✓':index+1}</div><div className="setup-copy"><h3>{step.name}</h3><p>{step.detail}</p>{step.href&&<a className={`btn compact ${step.done?'':'primary'}`} href={step.href}>{step.done?'Review':'Set up'}</a>}</div></article>)}</div></section></main></>
}
