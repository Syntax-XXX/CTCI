'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Overlay = {
  id:string; user_id:string; slug:string; channel_login:string|null; enabled:boolean;
  font_family:string; font_size:number; font_weight:number; message_spacing:number;
  username_color:string; message_color:string; accent_color:string; background_color:string;
  background_opacity:number; bubble_color:string; bubble_opacity:number; border_radius:number;
  show_badges:boolean; show_emotes:boolean; show_timestamps:boolean; show_usernames:boolean;
  max_messages:number; fade_seconds:number; animation:string; direction:string; custom_css:string;
}
type FontAsset={id:string;label:string;storage_path:string;mime_type:string}

const defaults: Partial<Overlay> = { font_family:'Inter',font_size:24,font_weight:600,message_spacing:10,username_color:'#A970FF',message_color:'#F4F4F5',accent_color:'#9147FF',background_color:'#0B0B10',background_opacity:.72,bubble_color:'#18181B',bubble_opacity:.78,border_radius:16,show_badges:true,show_emotes:true,show_timestamps:false,show_usernames:true,max_messages:12,fade_seconds:35,animation:'slide',direction:'bottom-up',custom_css:'' }

export default function Dashboard() {
  const supabase = useMemo(()=>createClient(),[])
  const router = useRouter()
  const [overlay,setOverlay]=useState<Overlay|null>(null)
  const [status,setStatus]=useState('Loading settings…')
  const [twitchLogin,setTwitchLogin]=useState<string|null>(null)
  const [fonts,setFonts]=useState<FontAsset[]>([])
  const [origin,setOrigin]=useState('https://chromachat.syntax-xxx.is-a.dev')
  const [chatter,setChatter]=useState({chatter_login:'',nickname:'',font_family:'',username_color:'#ffffff',message_color:'#ffffff',highlight:false,hidden:false})

  useEffect(()=>{setOrigin(window.location.origin);(async()=>{
    const { data:{ user } } = await supabase.auth.getUser()
    if(!user){ router.replace('/auth'); return }
    const [overlayRes,profileRes,fontRes]=await Promise.all([
      supabase.from('overlays').select('*').eq('user_id',user.id).single(),
      supabase.from('profiles').select('twitch_login').eq('id',user.id).single(),
      supabase.from('font_assets').select('id,label,storage_path,mime_type').eq('owner_id',user.id).order('created_at',{ascending:false}),
    ])
    if(overlayRes.error){setStatus(overlayRes.error.message);return}
    setOverlay({...defaults,...overlayRes.data} as Overlay)
    setTwitchLogin(profileRes.data?.twitch_login||null)
    setFonts((fontRes.data||[]) as FontAsset[])
    const twitchResult=new URLSearchParams(window.location.search).get('twitch')
    setStatus(twitchResult==='connected'?'Twitch connected and EventSub requested':twitchResult==='connected-no-eventsub'?'Twitch connected; EventSub needs server secrets':twitchResult==='error'?'Twitch connection failed':'Ready')
  })()},[router,supabase])

  function patch<K extends keyof Overlay>(key:K,value:Overlay[K]){setOverlay(v=>v?{...v,[key]:value}:v)}
  async function save(){ if(!overlay)return; setStatus('Saving…'); const {id,user_id,...payload}=overlay; const {error}=await supabase.from('overlays').update(payload).eq('id',id); setStatus(error?error.message:'Saved') }
  async function saveChatter(){ const {data:{user}}=await supabase.auth.getUser(); if(!user||!chatter.chatter_login.trim())return; const payload={...chatter,owner_id:user.id,chatter_login:chatter.chatter_login.trim().toLowerCase(),font_family:chatter.font_family||null}; const {error}=await supabase.from('chatter_styles').upsert(payload,{onConflict:'owner_id,chatter_login'}); setStatus(error?error.message:'Chatter style saved') }
  async function uploadFont(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0]; if(!file)return
    const {data:{user}}=await supabase.auth.getUser(); if(!user)return
    const ext=(file.name.split('.').pop()||'woff2').toLowerCase(); const allowed=['ttf','otf','woff','woff2']; if(!allowed.includes(ext)){setStatus('Font must be TTF, OTF, WOFF or WOFF2');return}
    const mime=ext==='woff2'?'font/woff2':ext==='woff'?'font/woff':ext==='otf'?'font/otf':'font/ttf'
    const label=file.name.replace(/\.[^.]+$/,'').slice(0,80); const path=`${user.id}/${crypto.randomUUID()}.${ext}`
    setStatus('Uploading font…')
    const upload=await supabase.storage.from('ctci-fonts').upload(path,file,{contentType:mime,upsert:false})
    if(upload.error){setStatus(upload.error.message);return}
    const saved=await supabase.from('font_assets').insert({owner_id:user.id,label,storage_path:path,mime_type:mime}).select('id,label,storage_path,mime_type').single()
    if(saved.error){setStatus(saved.error.message);return}
    setFonts(v=>[saved.data as FontAsset,...v]); patch('font_family',label); setStatus(`Font “${label}” uploaded`)
  }
  async function signOut(){await supabase.auth.signOut();router.replace('/')}

  if(!overlay)return <main className="shell"><div className="panel">{status}</div></main>
  const previewStyle={background:`rgba(${hex(overlay.background_color)},${overlay.background_opacity})`,fontFamily:overlay.font_family,fontSize:overlay.font_size,borderRadius:overlay.border_radius}
  const obsUrl=`${origin}/overlay/${overlay.slug}`
  return <main className="shell">
    <nav className="nav"><div className="brand">CTCI <span>Dashboard</span></div><div className="actions"><a className="btn" target="_blank" rel="noreferrer" href={`/overlay/${overlay.slug}`}>Open OBS overlay</a><button className="btn" onClick={signOut}>Sign out</button></div></nav>
    <div className="grid">
      <section className="panel">
        <div className="section-head"><div><h2>Twitch connection</h2><p className="muted">Authorize the channel that CTCI should listen to.</p></div><a className={`btn ${twitchLogin?'':'primary'}`} href="/api/auth/twitch">{twitchLogin?'Reconnect Twitch':'Connect Twitch'}</a></div>
        <div className="status">{twitchLogin?`Connected as ${twitchLogin}`:'No Twitch account connected yet'}</div>
        <hr className="divider" />

        <h2>Overlay settings</h2><p className="muted">OBS Browser Source URL</p><div className="copy-row"><code>{obsUrl}</code><button className="btn" onClick={()=>navigator.clipboard.writeText(obsUrl).then(()=>setStatus('OBS URL copied'))}>Copy</button></div>
        <div className="field"><label>Twitch channel login</label><input value={overlay.channel_login||''} onChange={e=>patch('channel_login',e.target.value.toLowerCase())} placeholder="your_twitch_name" /></div>
        <div className="row"><div className="field"><label>Font family</label><select value={overlay.font_family} onChange={e=>patch('font_family',e.target.value)}><option value="Inter">Inter</option><option value="Arial">Arial</option><option value="Verdana">Verdana</option><option value="Georgia">Georgia</option>{fonts.map(f=><option key={f.id} value={f.label}>{f.label}</option>)}</select></div><div className="field"><label>Font size</label><input type="number" min="10" max="96" value={overlay.font_size} onChange={e=>patch('font_size',+e.target.value)} /></div></div>
        <div className="row"><div className="field"><label>Font weight</label><input type="number" min="100" max="900" step="100" value={overlay.font_weight} onChange={e=>patch('font_weight',+e.target.value)} /></div><div className="field"><label>Message spacing</label><input type="number" min="0" max="48" value={overlay.message_spacing} onChange={e=>patch('message_spacing',+e.target.value)} /></div></div>
        <div className="row"><div className="field"><label>Username color</label><input type="color" value={overlay.username_color} onChange={e=>patch('username_color',e.target.value)} /></div><div className="field"><label>Message color</label><input type="color" value={overlay.message_color} onChange={e=>patch('message_color',e.target.value)} /></div></div>
        <div className="row"><div className="field"><label>Bubble color</label><input type="color" value={overlay.bubble_color} onChange={e=>patch('bubble_color',e.target.value)} /></div><div className="field"><label>Bubble opacity</label><input type="range" min="0" max="1" step="0.05" value={overlay.bubble_opacity} onChange={e=>patch('bubble_opacity',+e.target.value)} /></div></div>
        <div className="row"><div className="field"><label>Border radius</label><input type="number" min="0" max="48" value={overlay.border_radius} onChange={e=>patch('border_radius',+e.target.value)} /></div><div className="field"><label>Animation</label><select value={overlay.animation} onChange={e=>patch('animation',e.target.value)}><option>slide</option><option>fade</option><option>pop</option><option>none</option></select></div></div>
        <div className="row"><div className="field"><label>Max messages</label><input type="number" min="1" max="100" value={overlay.max_messages} onChange={e=>patch('max_messages',+e.target.value)} /></div><div className="field"><label>Fade after seconds (0 = never)</label><input type="number" min="0" max="300" value={overlay.fade_seconds} onChange={e=>patch('fade_seconds',+e.target.value)} /></div></div>
        <div className="row"><label className="check"><input type="checkbox" checked={overlay.show_timestamps} onChange={e=>patch('show_timestamps',e.target.checked)}/> Show timestamps</label><label className="check"><input type="checkbox" checked={overlay.show_usernames} onChange={e=>patch('show_usernames',e.target.checked)}/> Show usernames</label></div>
        <div className="field"><label>Direction</label><select value={overlay.direction} onChange={e=>patch('direction',e.target.value)}><option value="bottom-up">Bottom → up</option><option value="top-down">Top → down</option></select></div>
        <div className="field"><label>Custom CSS</label><textarea value={overlay.custom_css} onChange={e=>patch('custom_css',e.target.value)} placeholder="Optional CSS applied inside the overlay" /></div>
        <div className="actions"><button className="btn primary" onClick={save}>Save overlay</button><span className="status">{status}</span></div>
        <hr className="divider" />

        <h2>Custom fonts</h2><p className="muted">Upload TTF, OTF, WOFF or WOFF2. CTCI will make it available to this overlay.</p><div className="actions"><label className="btn file-btn">Upload font<input hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={uploadFont}/></label>{fonts.slice(0,4).map(f=><button key={f.id} className="chip" onClick={()=>patch('font_family',f.label)}>{f.label}</button>)}</div>
        <hr className="divider" />

        <h2>Per-chatter style</h2><p className="muted">Override font, nickname and colors for a specific Twitch login.</p>
        <div className="row"><div className="field"><label>Chatter login</label><input value={chatter.chatter_login} onChange={e=>setChatter({...chatter,chatter_login:e.target.value})}/></div><div className="field"><label>Nickname</label><input value={chatter.nickname} onChange={e=>setChatter({...chatter,nickname:e.target.value})}/></div></div>
        <div className="field"><label>Custom font family</label><select value={chatter.font_family} onChange={e=>setChatter({...chatter,font_family:e.target.value})}><option value="">Use overlay font</option>{fonts.map(f=><option key={f.id}>{f.label}</option>)}</select></div>
        <div className="row"><div className="field"><label>Username color</label><input type="color" value={chatter.username_color} onChange={e=>setChatter({...chatter,username_color:e.target.value})}/></div><div className="field"><label>Message color</label><input type="color" value={chatter.message_color} onChange={e=>setChatter({...chatter,message_color:e.target.value})}/></div></div>
        <div className="row"><label className="check"><input type="checkbox" checked={chatter.highlight} onChange={e=>setChatter({...chatter,highlight:e.target.checked})}/> Highlight chatter</label><label className="check"><input type="checkbox" checked={chatter.hidden} onChange={e=>setChatter({...chatter,hidden:e.target.checked})}/> Hide chatter</label></div>
        <div className="actions"><button className="btn" onClick={saveChatter}>Save chatter style</button></div>
      </section>
      <aside className="panel sticky"><h2>Live preview</h2><div className="preview" style={previewStyle}><ChatPreview overlay={overlay}/></div><p className="small muted">The OBS renderer subscribes to Supabase Realtime and receives verified EventSub chat messages as they arrive.</p></aside>
    </div>
  </main>
}

function ChatPreview({overlay}:{overlay:Overlay}){const samples=[['LunaMod','This overlay is looking clean ✨'],['pixelPilot','Custom fonts per chatter? yes please'],['syntax_dev','OBS Browser Source is ready.']];return <>{samples.map(([u,m])=><div className={`msg ${overlay.animation}`} key={u} style={{background:`rgba(${hex(overlay.bubble_color)},${overlay.bubble_opacity})`,borderRadius:overlay.border_radius,color:overlay.message_color,marginTop:overlay.message_spacing}}><strong style={{color:overlay.username_color}}>{u}</strong>{m}</div>)}</>}
function hex(v:string){const h=v.replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return `${(n>>16)&255},${(n>>8)&255},${n&255}`}
