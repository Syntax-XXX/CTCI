'use client'

import { useEffect,useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

export default function ChatSourcesPage(){
  const router=useRouter()
  const[showTwitch,setShowTwitch]=useState(true),[showYouTube,setShowYouTube]=useState(false),[autoDetect,setAutoDetect]=useState(true),[youtube,setYoutube]=useState('')
  const[connected,setConnected]=useState(false),[channel,setChannel]=useState(''),[activeTitle,setActiveTitle]=useState(''),[status,setStatus]=useState('Loading chat sources…'),[saving,setSaving]=useState(false),[lastSync,setLastSync]=useState<string|null>(null)

  useEffect(()=>{void(async()=>{const sb=createClient();const{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}const r=await fetch('/api/chat/sources',{cache:'no-store'}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'Could not load chat sources');return}setShowTwitch(b.show_twitch_chat!==false);setShowYouTube(b.show_youtube_chat===true);setAutoDetect(b.youtube_auto_detect!==false);setYoutube(b.youtube_video_id||'');setConnected(b.youtube_connected===true);setChannel(b.youtube_oauth_channel_title||b.youtube_channel_title||'');setActiveTitle(b.youtube_active_title||'');setLastSync(b.youtube_last_sync_at||null);const q=new URLSearchParams(window.location.search).get('youtube');setStatus(q==='connected'?'YouTube connected. New livestreams will be detected automatically.':q==='denied'?'YouTube connection was cancelled.':q==='error'?'YouTube connection failed.':'Chat sources ready')})()},[router])

  async function save(){if(!showTwitch&&!showYouTube){setStatus('Keep at least Twitch or YouTube enabled.');return}if(showYouTube&&autoDetect&&!connected){setStatus('Connect YouTube first so CTCI can detect your broadcasts automatically.');return}setSaving(true);setStatus('Saving chat sources…');try{const r=await fetch('/api/chat/sources',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({showTwitch,showYouTube,youtube,autoDetect})}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'Could not save chat sources');return}if(showYouTube){const slug=await getSlug(),sync=await fetch(`/api/youtube/chat?slug=${encodeURIComponent(slug)}`,{cache:'no-store'}),body=await sync.json().catch(()=>({}));setStatus(body.connected?'Saved. YouTube live chat is connected.':autoDetect?'Saved. CTCI is watching for your next YouTube livestream.':'Saved. Manual YouTube source configured.')}else setStatus('Chat sources saved')}finally{setSaving(false)}}
  async function getSlug(){const sb=createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return'';const{data}=await sb.from('overlays').select('slug').eq('user_id',user.id).single();return data?.slug||''}
  async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}

  return <><DashboardNav onSignOut={signOut}/><main className="app-main">
    <section className="dashboard-hero"><div><span className="eyebrow">CHAT SOURCES</span><h1>Twitch + YouTube, one overlay.</h1><p>Connect each platform once. CTCI merges both chats and automatically follows your newest active YouTube broadcast whenever you go live.</p></div><div className="hero-status"><div><strong>{showTwitch&&showYouTube?'Twitch + YouTube':showYouTube?'YouTube only':'Twitch only'}</strong><span>{status}</span></div></div></section>

    <section className="setup-grid">
      <article className={`setup-card ${showTwitch?'done':''}`}><div className="setup-index" style={{background:'#9147ff',color:'#fff'}}>T</div><div className="setup-copy"><h3>Twitch Chat</h3><p>Realtime Twitch EventSub chat and CTCI commands.</p></div><label className="check"><input type="checkbox" checked={showTwitch} onChange={e=>setShowTwitch(e.target.checked)}/> Show Twitch</label></article>
      <article className={`setup-card ${showYouTube?'done':''}`}><div className="setup-index" style={{background:'#ff0033',color:'#fff'}}>▶</div><div className="setup-copy"><h3>YouTube Live Chat</h3><p>{connected?`Connected to ${channel||'your YouTube channel'}`:'Connect once so CTCI can find every future live stream.'}</p></div><label className="check"><input type="checkbox" checked={showYouTube} onChange={e=>setShowYouTube(e.target.checked)}/> Show YouTube</label></article>
    </section>

    <section className="panel"><div className="section-head"><div><span className="section-kicker">YOUTUBE AUTO LIVE</span><h2>Automatic livestream detection</h2><p className="muted">After one OAuth connection, CTCI asks YouTube for your currently active broadcast and automatically switches when you start a new stream. No watch URL needed.</p></div><a className={`btn ${connected?'':'primary'}`} href="/api/youtube/connect">{connected?'Reconnect YouTube':'Connect YouTube'}</a></div>
      <div className="row"><label className="check"><input type="checkbox" checked={autoDetect} onChange={e=>setAutoDetect(e.target.checked)} disabled={!showYouTube}/> Auto-detect newest live stream</label><div className="field"><label>Connected channel</label><input value={connected?channel:'Not connected'} readOnly/></div></div>
      {activeTitle&&<div className="hero-status"><span className="health-dot online"/><div><strong>Currently attached</strong><span>{activeTitle}</span></div></div>}
      {!autoDetect&&<div className="field"><label>Manual YouTube livestream URL or video ID</label><input value={youtube} onChange={e=>setYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." disabled={!showYouTube}/><span className="small muted">Manual fallback only. Automatic mode is recommended.</span></div>}
      <div className="actions"><button className="btn primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save chat sources'}</button>{lastSync&&<span className="small muted">Last YouTube chat sync: {new Date(lastSync).toLocaleString()}</span>}</div>
    </section>

    <section className="panel"><div className="section-head"><div><span className="section-kicker">DISPLAY</span><h2>One chat, clear platform identity</h2></div></div><p className="muted">Twitch and YouTube messages use the same responsive OBS layout. Each message carries its platform mark. YouTube Super Chats, Super Stickers and memberships are also ingested as special event types for highlighted rendering and future plugin automation.</p></section>
  </main></>
}
