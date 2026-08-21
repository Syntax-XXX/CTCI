'use client'

import { useEffect,useMemo,useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

type Feature={key:string;name:string;group:string;description:string;requirements:string[];maturity:'ready'|'foundation'|'integration'}

const requirementLabel:Record<string,string>={none:'No extra setup',twitch:'Twitch connection',youtube:'YouTube OAuth',discord:'Discord bot',obs:'Local OBS WebSocket bridge',spotify:'Spotify OAuth app',streamelements:'StreamElements credentials',streamlabs:'Streamlabs OAuth/API',ai:'AI provider API key',email:'Email provider/API',translation:'Translation provider (optional)'}

export default function FeaturesPage(){
  const router=useRouter(),[features,setFeatures]=useState<Feature[]>([]),[flags,setFlags]=useState<Record<string,boolean>>({}),[status,setStatus]=useState('Loading features…'),[busy,setBusy]=useState('')
  useEffect(()=>{void(async()=>{const sb=createClient(),{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}const r=await fetch('/api/features',{cache:'no-store'}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'Could not load features');return}setFeatures(b.features||[]);setFlags(b.flags||{});setStatus('All optional features default to OFF. Only you can enable them.')})()},[router])
  const groups=useMemo(()=>{const map=new Map<string,Feature[]>();for(const f of features){const list=map.get(f.group)||[];list.push(f);map.set(f.group,list)}return[...map.entries()]},[features])
  async function toggle(key:string,enabled:boolean){setBusy(key);setStatus(`${enabled?'Enabling':'Disabling'} feature…`);try{const r=await fetch('/api/features',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,enabled})}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'Feature update failed');return}setFlags(b.flags||{...flags,[key]:enabled});setStatus(`${features.find(f=>f.key===key)?.name||key} ${enabled?'enabled':'disabled'}.`)}finally{setBusy('')}}
  async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}
  return <><DashboardNav onSignOut={signOut}/><main className="app-main">
    <section className="dashboard-hero"><div><span className="eyebrow">FEATURE CENTER</span><h1>You decide what CTCI runs.</h1><p>Every optional module is installed behind a streamer-owned server-side feature flag. OFF means the backend refuses to execute it, even if someone manually calls its route.</p></div><div className="hero-status"><div><strong>{Object.values(flags).filter(Boolean).length} enabled</strong><span>{status}</span></div></div></section>
    {groups.map(([group,list])=><section className="panel" key={group}><div className="section-head"><div><span className="section-kicker">{group.toUpperCase()}</span><h2>{group}</h2></div></div><div className="setup-grid">{list.map(feature=>{const enabled=flags[feature.key]===true;return <article className={`setup-card ${enabled?'done':''}`} key={feature.key}><div className="setup-index">{enabled?'✓':'○'}</div><div className="setup-copy"><h3>{feature.name}</h3><p>{feature.description}</p><div className="actions" style={{marginTop:8,flexWrap:'wrap'}}>{feature.requirements.map(req=><span className="small muted" key={req}>• {requirementLabel[req]||req}</span>)}<span className="small muted">• {feature.maturity==='ready'?'Usable now':feature.maturity==='integration'?'Needs integration setup':'Foundation installed'}</span></div></div><label className="check"><input type="checkbox" checked={enabled} disabled={busy===feature.key} onChange={e=>void toggle(feature.key,e.target.checked)}/>{enabled?' Enabled':' Disabled'}</label></article>})}</div></section>)}
  </main></>
}
