'use client'

import { useEffect,useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

const samples=[
  {source:'twitch',name:'VeryLongStreamerUsername_123',text:'This is a normal Twitch message with a very long line that should wrap cleanly without leaving the browser source. Kappa',special:''},
  {source:'youtube',name:'YouTube Viewer',text:'YouTube live chat is merged into the same responsive layout ▶',special:''},
  {source:'twitch',name:'VIPViewer',text:'Huge emote test 😎 🎉 🚀 ✨',special:''},
  {source:'youtube',name:'Member',text:'Thanks for the amazing stream!',special:'SUPER CHAT · €20'},
  {source:'twitch',name:'Moderator',text:'Compact resolution stress test — 0123456789012345678901234567890123456789',special:'FEATURED'},
]
export default function ObsTester(){
  const router=useRouter(),[width,setWidth]=useState(1920),[height,setHeight]=useState(1080),[allowed,setAllowed]=useState(false),[status,setStatus]=useState('Checking feature…')
  useEffect(()=>{void(async()=>{const sb=createClient(),{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}const r=await fetch('/api/features',{cache:'no-store'}),b=await r.json().catch(()=>({}));setAllowed(r.ok&&b.flags?.obs_tester===true);setStatus(r.ok&&b.flags?.obs_tester===true?'Tester ready.':'OBS Source Tester is disabled in Feature Center.')})()},[router])
  async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}
  const scale=Math.min(1,820/Math.max(width,1),520/Math.max(height,1)),previewW=Math.max(160,width*scale),previewH=Math.max(90,height*scale)
  return <><DashboardNav onSignOut={signOut}/><main className="app-main"><section className="dashboard-hero"><div><span className="eyebrow">OBS SOURCE TESTER · BETA</span><h1>Break the overlay here, not on stream.</h1><p>Stress-test long names, paid events, message wrapping and common landscape/vertical resolutions.</p></div><div className="hero-status"><div><strong>{width}×{height}</strong><span>{status}</span></div></div></section>{allowed&&<><section className="panel"><div className="actions" style={{flexWrap:'wrap'}}>{[[1920,1080],[1280,720],[854,480],[640,360],[320,180],[1080,1920],[1080,1350]].map(([w,h])=><button className="btn compact" key={`${w}x${h}`} onClick={()=>{setWidth(w);setHeight(h)}}>{w}×{h}</button>)}</div><div className="row"><div className="field"><label>Width</label><input type="number" min={160} max={7680} value={width} onChange={e=>setWidth(Math.max(160,Number(e.target.value)||160))}/></div><div className="field"><label>Height</label><input type="number" min={90} max={4320} value={height} onChange={e=>setHeight(Math.max(90,Number(e.target.value)||90))}/></div></div></section><section className="panel"><div style={{width:previewW,height:previewH,maxWidth:'100%',margin:'0 auto',position:'relative',overflow:'hidden',background:'linear-gradient(135deg,#0a0a12,#141421)',border:'1px solid rgba(255,255,255,.15)',borderRadius:12,padding:Math.max(4,12*scale),display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:Math.max(2,8*scale)}}>{samples.map((m,index)=><div key={index} style={{background:'rgba(20,20,32,.82)',borderRadius:Math.max(4,12*scale),padding:`${Math.max(3,8*scale)}px ${Math.max(4,10*scale)}px`,fontSize:Math.max(7,24*scale),lineHeight:1.25,overflowWrap:'anywhere'}}>{m.special&&<span style={{fontSize:'.65em',opacity:.65,marginRight:6}}>{m.special}</span>}<span style={{marginRight:4}}>{m.source==='youtube'?'▶':'▣'}</span><strong>{m.name}</strong>{' '}{m.text}</div>)}</div><p className="small muted" style={{marginTop:12}}>Preview is scaled to fit the dashboard; layout proportions match the selected OBS Browser Source size.</p></section></>}</main></>
}
