'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

export default function ChatSourcesPage(){
  const router=useRouter()
  const[showTwitch,setShowTwitch]=useState(true)
  const[showYouTube,setShowYouTube]=useState(false)
  const[youtube,setYoutube]=useState('')
  const[status,setStatus]=useState('Loading chat sources…')
  const[saving,setSaving]=useState(false)
  const[lastSync,setLastSync]=useState<string|null>(null)

  useEffect(()=>{void(async()=>{
    const sb=createClient();const{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}
    const r=await fetch('/api/chat/sources',{cache:'no-store'}),b=await r.json().catch(()=>({}))
    if(!r.ok){setStatus(b.error||'Could not load chat sources');return}
    setShowTwitch(b.show_twitch_chat!==false);setShowYouTube(b.show_youtube_chat===true);setYoutube(b.youtube_video_id||'');setLastSync(b.youtube_last_sync_at||null);setStatus('Chat sources ready')
  })()},[router])

  async function save(){
    if(!showTwitch&&!showYouTube){setStatus('Keep at least Twitch or YouTube enabled.');return}
    setSaving(true);setStatus('Saving chat sources…')
    try{
      const r=await fetch('/api/chat/sources',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({showTwitch,showYouTube,youtube})})
      const b=await r.json().catch(()=>({}))
      if(!r.ok){setStatus(b.error||'Could not save chat sources');return}
      if(showYouTube){const sync=await fetch(`/api/youtube/chat?slug=${encodeURIComponent(await getSlug())}`,{cache:'no-store'});const sb=await sync.json().catch(()=>({}));if(!sync.ok&&sync.status!==503)setStatus(sb.error||'Saved, but YouTube sync needs attention');else setStatus(sync.status===503?'Saved. Add YOUTUBE_API_KEY in Vercel to activate YouTube chat.':'Saved. YouTube chat connected or waiting for the livestream to go live.')}
      else setStatus('Chat sources saved')
    }finally{setSaving(false)}
  }

  async function getSlug(){const sb=createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return'';const{data}=await sb.from('overlays').select('slug').eq('user_id',user.id).single();return data?.slug||''}
  async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}

  return <><DashboardNav onSignOut={signOut}/><main className="app-main">
    <section className="dashboard-hero"><div><span className="eyebrow">CHAT SOURCES</span><h1>Twitch + YouTube, one overlay.</h1><p>Choose which platforms appear in your OBS chat. Every message is marked with its platform so viewers can see where it came from.</p></div><div className="hero-status"><div><strong>{showTwitch&&showYouTube?'Twitch + YouTube':showYouTube?'YouTube only':'Twitch only'}</strong><span>{status}</span></div></div></section>

    <section className="setup-grid">
      <article className={`setup-card ${showTwitch?'done':''}`}><div className="setup-index" style={{background:'#9147ff',color:'#fff'}}>T</div><div className="setup-copy"><h3>Twitch Chat</h3><p>Realtime Twitch EventSub chat and CTCI commands.</p></div><label className="check"><input type="checkbox" checked={showTwitch} onChange={e=>setShowTwitch(e.target.checked)}/> Show Twitch</label></article>
      <article className={`setup-card ${showYouTube?'done':''}`}><div className="setup-index" style={{background:'#ff0033',color:'#fff'}}>▶</div><div className="setup-copy"><h3>YouTube Live Chat</h3><p>Polls the active live chat through YouTube Data API using Vercel only.</p></div><label className="check"><input type="checkbox" checked={showYouTube} onChange={e=>setShowYouTube(e.target.checked)}/> Show YouTube</label></article>
    </section>

    <section className="panel"><div className="section-head"><div><span className="section-kicker">YOUTUBE LIVE</span><h2>Livestream connection</h2><p className="muted">Paste a normal watch URL, youtu.be URL, /live URL, or the video ID. CTCI discovers the active live chat automatically.</p></div></div>
      <div className="field"><label>YouTube livestream URL or video ID</label><input value={youtube} onChange={e=>setYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." disabled={!showYouTube}/></div>
      <div className="actions"><button className="btn primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save chat sources'}</button>{lastSync&&<span className="small muted">Last YouTube sync: {new Date(lastSync).toLocaleString()}</span>}</div>
    </section>

    <section className="panel"><div className="section-head"><div><span className="section-kicker">DISPLAY</span><h2>How merged chat works</h2></div></div><p className="muted">Twitch and YouTube messages share the same styling, animations, responsive layout and OBS Browser Source. Twitch messages use a purple platform mark; YouTube messages use a red play mark. Turning either source off immediately removes that source from the active overlay.</p></section>
  </main></>
}
