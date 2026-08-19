'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
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
type GuildConnection={guild_id:string;guild_name:string}

const defaults: Partial<Overlay> = {font_family:'Inter',font_size:24,font_weight:600,message_spacing:10,username_color:'#A970FF',message_color:'#F4F4F5',accent_color:'#9147FF',background_color:'#0B0B10',background_opacity:.72,bubble_color:'#18181B',bubble_opacity:.78,border_radius:16,show_badges:true,show_emotes:true,show_timestamps:false,show_usernames:true,max_messages:12,fade_seconds:35,animation:'slide',direction:'bottom-up',custom_css:''}

export default function Dashboard(){
  const supabase=useMemo(()=>createClient(),[]),router=useRouter()
  const[overlay,setOverlay]=useState<Overlay|null>(null),[status,setStatus]=useState('Loading your studio…'),[twitchLogin,setTwitchLogin]=useState<string|null>(null),[fonts,setFonts]=useState<FontAsset[]>([]),[guild,setGuild]=useState<GuildConnection|null>(null),[ruleCount,setRuleCount]=useState(0),[origin,setOrigin]=useState('https://chromachat.syntax-xxx.is-a.dev'),[copied,setCopied]=useState(false)
  const[chatter,setChatter]=useState({chatter_login:'',nickname:'',font_family:'',username_color:'#ffffff',message_color:'#ffffff',highlight:false,hidden:false})

  useEffect(()=>{setOrigin(window.location.origin);(async()=>{
    const{data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/auth');return}
    const[o,p,f,g,r]=await Promise.all([
      supabase.from('overlays').select('*').eq('user_id',user.id).single(),
      supabase.from('profiles').select('twitch_login').eq('id',user.id).single(),
      supabase.from('font_assets').select('id,label,storage_path,mime_type').eq('owner_id',user.id).order('created_at',{ascending:false}),
      supabase.from('discord_guild_connections').select('guild_id,guild_name').eq('owner_id',user.id).maybeSingle(),
      supabase.from('discord_badge_sync').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('enabled',true),
    ])
    if(o.error){setStatus(o.error.message);return}
    setOverlay({...defaults,...o.data} as Overlay);setTwitchLogin(p.data?.twitch_login||null);setFonts((f.data||[])as FontAsset[]);setGuild(g.data as GuildConnection|null);setRuleCount(r.count||0)
    const q=new URLSearchParams(window.location.search).get('twitch');setStatus(q==='connected'?'Twitch connected. Your chat is ready.':q==='connected-no-eventsub'?'Twitch connected, but chat events need attention.':q==='error'?'Twitch connection failed.':'Studio ready')
  })()},[router,supabase])

  function patch<K extends keyof Overlay>(key:K,value:Overlay[K]){setOverlay(v=>v?{...v,[key]:value}:v)}
  async function save(){if(!overlay)return;setStatus('Saving overlay…');const{id,user_id,...payload}=overlay;const{error}=await supabase.from('overlays').update(payload).eq('id',id);setStatus(error?error.message:'Overlay saved')}
  async function saveChatter(){const{data:{user}}=await supabase.auth.getUser();if(!user||!chatter.chatter_login.trim())return;const payload={...chatter,owner_id:user.id,chatter_login:chatter.chatter_login.trim().toLowerCase(),font_family:chatter.font_family||null};const{error}=await supabase.from('chatter_styles').upsert(payload,{onConflict:'owner_id,chatter_login'});setStatus(error?error.message:'Chatter style saved')}
  async function uploadFont(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;const{data:{user}}=await supabase.auth.getUser();if(!user)return;const ext=(file.name.split('.').pop()||'woff2').toLowerCase(),allowed=['ttf','otf','woff','woff2'];if(!allowed.includes(ext)){setStatus('Font must be TTF, OTF, WOFF or WOFF2');return}const mime=ext==='woff2'?'font/woff2':ext==='woff'?'font/woff':ext==='otf'?'font/otf':'font/ttf',label=file.name.replace(/\.[^.]+$/,'').slice(0,80),path=`${user.id}/${crypto.randomUUID()}.${ext}`;setStatus('Uploading font…');const up=await supabase.storage.from('ctci-fonts').upload(path,file,{contentType:mime,upsert:false});if(up.error){setStatus(up.error.message);return}const saved=await supabase.from('font_assets').insert({owner_id:user.id,label,storage_path:path,mime_type:mime}).select('id,label,storage_path,mime_type').single();if(saved.error){setStatus(saved.error.message);return}setFonts(v=>[saved.data as FontAsset,...v]);patch('font_family',label);setStatus(`Font “${label}” uploaded`)}
  async function signOut(){await supabase.auth.signOut();router.replace('/')}
  async function copyObs(url:string){await navigator.clipboard.writeText(url);setCopied(true);setStatus('OBS Browser Source URL copied');window.setTimeout(()=>setCopied(false),1600)}

  if(!overlay)return <><DashboardNav onSignOut={signOut}/><main className="app-main"><div className="panel loading-panel">{status}</div></main></>
  const obsUrl=`${origin}/overlay/${overlay.slug}`,previewStyle={background:`rgba(${hex(overlay.background_color)},${overlay.background_opacity})`,fontFamily:overlay.font_family,fontSize:overlay.font_size,borderRadius:overlay.border_radius}
  const setup=[
    {done:!!twitchLogin,title:'Connect Twitch',text:twitchLogin?`Connected as ${twitchLogin}`:'Authorize the Twitch channel CTCI should listen to.',href:'/api/auth/twitch',action:twitchLogin?'Reconnect':'Connect Twitch'},
    {done:!!guild,title:'Install Discord bot',text:guild?`Connected to ${guild.guild_name}`:'Add the official CTCI bot to your streamer Discord.',href:'/api/discord/connect',action:guild?'Change server':'Install bot'},
    {done:ruleCount>0,title:'Sync Discord roles',text:ruleCount>0?`${ruleCount} role mapping${ruleCount===1?'':'s'} active.`:'Map Discord roles to chat badges with dropdowns.',href:'/dashboard/badges',action:'Set up badges'},
    {done:copied,title:'Add to OBS',text:'Copy your personal Browser Source URL and paste it into OBS.',href:'#obs',action:copied?'Copied!':'Copy OBS URL',copy:true},
  ]

  return <>
    <DashboardNav onSignOut={signOut}/>
    <main className="app-main">
      <section className="dashboard-hero">
        <div><span className="eyebrow">STREAMER STUDIO</span><h1>Your chat, ready for stream.</h1><p>Connect the services once, then customize as much—or as little—as you want. CTCI handles Twitch chat, Discord badges, and the OBS overlay.</p></div>
        <div className="hero-status"><span className={`health-dot ${twitchLogin?'online':''}`}/><div><strong>{twitchLogin?'Live connection ready':'Finish setup'}</strong><span>{status}</span></div></div>
      </section>

      <section className="setup-grid" aria-label="Streamer setup">
        {setup.map((step,i)=><article className={`setup-card ${step.done?'done':''}`} key={step.title}>
          <div className="setup-index">{step.done?'✓':i+1}</div><div className="setup-copy"><h3>{step.title}</h3><p>{step.text}</p></div>
          {step.copy?<button className="btn compact primary" onClick={()=>copyObs(obsUrl)}>{step.action}</button>:<Link className={`btn compact ${step.done?'':'primary'}`} href={step.href}>{step.action}</Link>}
        </article>)}
      </section>

      <div className="studio-layout">
        <section className="studio-content">
          <section className="panel" id="obs"><div className="section-head"><div><span className="section-kicker">OBS SOURCE</span><h2>Browser Source</h2><p className="muted">This URL is unique to your overlay. Add it once in OBS and future changes appear automatically.</p></div><a className="btn" target="_blank" rel="noreferrer" href={`/overlay/${overlay.slug}`}>Preview overlay ↗</a></div><div className="copy-row"><code>{obsUrl}</code><button className="btn primary" onClick={()=>copyObs(obsUrl)}>{copied?'Copied':'Copy URL'}</button></div></section>

          <section className="panel"><div className="section-head"><div><span className="section-kicker">CHAT STYLE</span><h2>Make it match your stream</h2><p className="muted">The essentials are up front. Advanced controls stay below.</p></div><button className="btn primary" onClick={save}>Save changes</button></div>
            <div className="row"><div className="field"><label>Font</label><select value={overlay.font_family} onChange={e=>patch('font_family',e.target.value)}><option>Inter</option><option>Arial</option><option>Verdana</option><option>Georgia</option>{fonts.map(f=><option key={f.id}>{f.label}</option>)}</select></div><div className="field"><label>Font size</label><input type="number" min="10" max="96" value={overlay.font_size} onChange={e=>patch('font_size',+e.target.value)}/></div></div>
            <div className="row"><div className="field"><label>Username color</label><input type="color" value={overlay.username_color} onChange={e=>patch('username_color',e.target.value)}/></div><div className="field"><label>Message color</label><input type="color" value={overlay.message_color} onChange={e=>patch('message_color',e.target.value)}/></div></div>
            <div className="row"><div className="field"><label>Bubble color</label><input type="color" value={overlay.bubble_color} onChange={e=>patch('bubble_color',e.target.value)}/></div><div className="field"><label>Animation</label><select value={overlay.animation} onChange={e=>patch('animation',e.target.value)}><option>slide</option><option>fade</option><option>pop</option><option>bounce</option><option>none</option></select></div></div>
            <details className="advanced"><summary>Advanced overlay settings</summary><div className="advanced-body"><div className="row"><div className="field"><label>Font weight</label><input type="number" min="100" max="900" step="100" value={overlay.font_weight} onChange={e=>patch('font_weight',+e.target.value)}/></div><div className="field"><label>Message spacing</label><input type="number" min="0" max="48" value={overlay.message_spacing} onChange={e=>patch('message_spacing',+e.target.value)}/></div></div><div className="row"><div className="field"><label>Bubble opacity</label><input type="range" min="0" max="1" step="0.05" value={overlay.bubble_opacity} onChange={e=>patch('bubble_opacity',+e.target.value)}/></div><div className="field"><label>Border radius</label><input type="number" min="0" max="48" value={overlay.border_radius} onChange={e=>patch('border_radius',+e.target.value)}/></div></div><div className="row"><div className="field"><label>Maximum messages</label><input type="number" min="1" max="100" value={overlay.max_messages} onChange={e=>patch('max_messages',+e.target.value)}/></div><div className="field"><label>Message lifetime (seconds)</label><input type="number" min="0" max="300" value={overlay.fade_seconds} onChange={e=>patch('fade_seconds',+e.target.value)}/></div></div><div className="row"><label className="check"><input type="checkbox" checked={overlay.show_timestamps} onChange={e=>patch('show_timestamps',e.target.checked)}/>Timestamps</label><label className="check"><input type="checkbox" checked={overlay.show_usernames} onChange={e=>patch('show_usernames',e.target.checked)}/>Usernames</label></div><div className="field"><label>Custom CSS</label><textarea value={overlay.custom_css} onChange={e=>patch('custom_css',e.target.value)} placeholder="Optional advanced CSS"/></div></div></details>
          </section>

          <section className="panel"><div className="section-head"><div><span className="section-kicker">EXTRAS</span><h2>Custom fonts & chatter styles</h2><p className="muted">Optional tools for streamers who want deeper personalization.</p></div></div><div className="actions"><label className="btn file-btn">Upload font<input hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={uploadFont}/></label>{fonts.slice(0,5).map(f=><button key={f.id} className="chip" onClick={()=>patch('font_family',f.label)}>{f.label}</button>)}</div><hr className="divider"/><div className="row"><div className="field"><label>Twitch chatter</label><input value={chatter.chatter_login} onChange={e=>setChatter({...chatter,chatter_login:e.target.value})} placeholder="username"/></div><div className="field"><label>Display nickname</label><input value={chatter.nickname} onChange={e=>setChatter({...chatter,nickname:e.target.value})}/></div></div><div className="field"><label>Custom font</label><select value={chatter.font_family} onChange={e=>setChatter({...chatter,font_family:e.target.value})}><option value="">Use overlay font</option>{fonts.map(f=><option key={f.id}>{f.label}</option>)}</select></div><div className="actions"><button className="btn" onClick={saveChatter}>Save chatter style</button><Link className="btn" href="/dashboard/badges">Manage badges</Link></div></section>
        </section>

        <aside className="studio-sidebar"><section className="panel preview-panel"><div className="section-head"><div><span className="section-kicker">LIVE PREVIEW</span><h2>Chat preview</h2></div></div><div className="preview" style={previewStyle}><ChatPreview overlay={overlay}/></div><div className="preview-meta"><span className="status success">Realtime</span><span className="small muted">Changes are reflected in OBS after save.</span></div></section><section className="panel quick-links"><h3>Streamer tools</h3><Link href="/dashboard/commands">⌘ Chat commands <span>→</span></Link><Link href="/dashboard/badges">◆ Discord badges <span>→</span></Link><Link href="/dashboard/plugins">◈ Plugins <span>→</span></Link></section></aside>
      </div>
    </main>
  </>
}

function ChatPreview({overlay}:{overlay:Overlay}){const samples=[['LunaMod','The new overlay is live ✨'],['pixelPilot','Discord badge sync looks clean'],['dc_syntax_xxx','Ready for stream.']];return <>{samples.map(([u,m],i)=><div className={`msg chat-message anim-${overlay.animation}`} key={u} style={{background:`rgba(${hex(overlay.bubble_color)},${overlay.bubble_opacity})`,borderRadius:overlay.border_radius,color:overlay.message_color,marginTop:i?overlay.message_spacing:0}}><strong style={{color:overlay.username_color}}>{u}</strong>{m}</div>)}</>}
function hex(v:string){const h=v.replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return`${(n>>16)&255},${(n>>8)&255},${n&255}`}
