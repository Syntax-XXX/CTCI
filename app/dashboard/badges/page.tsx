'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

type Badge={id:string;slug:string;name:string;icon_text:string|null;icon_url:string|null;color:string;is_platform:boolean}
type Rule={id:string;badge_id:string;guild_id:string;role_id:string;enabled:boolean}
type Role={id:string;name:string;color:number;position:number;managed:boolean}
type Channel={id:string;name:string;type:number;position:number;parent_id:string|null}
type Guild={guild_id:string;guild_name:string;guild_icon:string|null}
type DLink={id:string;twitch_login:string;discord_user_id:string}
type ChatSync={channel_id:string;channel_name:string;enabled:boolean;include_commands:boolean}

export default function BadgesPage(){
  const sb=useMemo(()=>createClient(),[]),router=useRouter()
  const[owner,setOwner]=useState(''),[badges,setBadges]=useState<Badge[]>([]),[rules,setRules]=useState<Rule[]>([]),[links,setLinks]=useState<DLink[]>([]),[guild,setGuild]=useState<Guild|null>(null),[roles,setRoles]=useState<Role[]>([]),[channels,setChannels]=useState<Channel[]>([]),[status,setStatus]=useState('Loading Discord setup…')
  const[chatSync,setChatSync]=useState<ChatSync>({channel_id:'',channel_name:'',enabled:false,include_commands:false})
  const[form,setForm]=useState({name:'',slug:'',icon_text:'',icon_url:'',color:'#8B5CF6'}),[give,setGive]=useState({badge_id:'',twitch_login:''}),[rule,setRule]=useState({badge_id:'',role_id:''}),[link,setLink]=useState({twitch_login:'',discord_user_id:''})

  async function load(){
    const{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}setOwner(user.id)
    const[b,ru,li,g,cs]=await Promise.all([
      sb.from('badge_definitions').select('*').or(`owner_id.is.null,owner_id.eq.${user.id}`).order('created_at'),
      sb.from('discord_badge_sync').select('*').eq('owner_id',user.id),
      sb.from('discord_user_links').select('id,twitch_login,discord_user_id').eq('owner_id',user.id),
      sb.from('discord_guild_connections').select('guild_id,guild_name,guild_icon').eq('owner_id',user.id).maybeSingle(),
      sb.from('discord_chat_sync').select('channel_id,channel_name,enabled,include_commands').eq('owner_id',user.id).maybeSingle(),
    ])
    setBadges((b.data||[])as Badge[]);setRules((ru.data||[])as Rule[]);setLinks((li.data||[])as DLink[]);setGuild(g.data as Guild|null)
    if(cs.data)setChatSync(cs.data as ChatSync)
    if(g.data){
      const[rr,cr]=await Promise.all([fetch('/api/discord/roles',{cache:'no-store'}),fetch('/api/discord/channels',{cache:'no-store'})])
      const[rb,cb]=await Promise.all([rr.json(),cr.json()])
      setRoles(rr.ok?(rb.roles||[]):[]);setChannels(cr.ok?(cb.channels||[]):[])
      setStatus(rr.ok&&cr.ok?'Discord ready':rb.error||cb.error||'Could not load Discord setup')
    }else{setRoles([]);setChannels([]);setStatus('Install the CTCI bot to get started')}
  }
  useEffect(()=>{load()},[])

  async function saveChatSync(){
    if(!guild){setStatus('Install the Discord bot first');return}
    if(!chatSync.channel_id){setStatus('Choose a Discord text channel');return}
    const selected=channels.find(c=>c.id===chatSync.channel_id)
    const{error}=await sb.from('discord_chat_sync').upsert({owner_id:owner,guild_id:guild.guild_id,channel_id:chatSync.channel_id,channel_name:selected?.name||chatSync.channel_name,enabled:chatSync.enabled,include_commands:chatSync.include_commands,updated_at:new Date().toISOString()},{onConflict:'owner_id'})
    setStatus(error?error.message:`Twitch chat sync ${chatSync.enabled?'enabled':'saved but disabled'}`)
    if(!error)setChatSync(v=>({...v,channel_name:selected?.name||v.channel_name}))
  }
  async function create(){if(!form.name.trim()||!form.slug.trim()){setStatus('Give the badge a name and slug first');return}const{error}=await sb.from('badge_definitions').insert({owner_id:owner,name:form.name.trim(),slug:form.slug.trim().toLowerCase(),icon_text:form.icon_text.trim()||null,icon_url:form.icon_url.trim()||null,color:form.color,is_platform:false});setStatus(error?error.message:'Badge created');if(!error){setForm({name:'',slug:'',icon_text:'',icon_url:'',color:'#8B5CF6'});await load()}}
  async function giveBadge(){const{error}=await sb.from('badge_assignments').insert({owner_id:owner,badge_id:give.badge_id,twitch_login:give.twitch_login.trim().toLowerCase(),source:'manual'});setStatus(error?error.message:'Badge assigned')}
  async function addRule(){if(!guild){setStatus('Install the Discord bot first');return}if(!rule.badge_id||!rule.role_id){setStatus('Choose a Discord role and a CTCI badge');return}const{error}=await sb.from('discord_badge_sync').insert({owner_id:owner,badge_id:rule.badge_id,guild_id:guild.guild_id,role_id:rule.role_id,enabled:true});setStatus(error?error.message:'Role sync added');if(!error){setRule({badge_id:'',role_id:''});await load()}}
  async function removeRule(id:string){const{error}=await sb.from('discord_badge_sync').delete().eq('id',id).eq('owner_id',owner);setStatus(error?error.message:'Role sync removed');if(!error)await load()}
  async function addLink(){const{error}=await sb.from('discord_user_links').upsert({owner_id:owner,twitch_login:link.twitch_login.trim().toLowerCase(),discord_user_id:link.discord_user_id.trim()},{onConflict:'owner_id,twitch_login'});setStatus(error?error.message:'Member link saved');if(!error)await load()}
  async function sync(){setStatus('Syncing badges from Discord…');const res=await fetch('/api/badges/discord-sync',{method:'POST'}),body=await res.json();setStatus(res.ok?`Sync complete · ${body.granted} added · ${body.removed} removed`:(body.error||'Sync failed'))}
  async function signOut(){await sb.auth.signOut();router.replace('/')}
  const customBadges=badges.filter(b=>!b.is_platform),roleName=(id:string)=>roles.find(r=>r.id===id)?.name||'Discord role',badgeName=(id:string)=>badges.find(b=>b.id===id)?.name||'Badge'

  return <><DashboardNav onSignOut={signOut}/><main className="app-main">
    <section className="dashboard-hero"><div><span className="eyebrow">DISCORD</span><h1>Connect once. Let CTCI handle the rest.</h1><p>Install the official CTCI bot, mirror Twitch chat into Discord, and turn Discord roles into chat badges—all with dropdowns.</p></div><div className="hero-status"><span className={`health-dot ${guild?'online':''}`}/><div><strong>{guild?guild.guild_name:'Discord not connected'}</strong><span>{status}</span></div></div></section>

    <section className="panel discord-setup" id="discord"><div className="section-head"><div><span className="section-kicker">STEP 1</span><h2>Connect your streamer Discord</h2><p className="muted">No bot token, Guild ID, Role ID, or channel ID is required.</p></div><a className="btn primary" href="/api/discord/connect">{guild?'Reconnect / change server':'Install CTCI bot'}</a></div>{guild?<div className="discord-connected"><div className="discord-server"><div className="discord-server-icon">D</div><div><strong>{guild.guild_name}</strong><span>{roles.length} roles · {channels.length} chat channels available</span></div></div><span className="status success">Connected</span></div>:<div className="discord-connected"><div className="discord-server"><div className="discord-server-icon">D</div><div><strong>Add CTCI to your server</strong><span>Discord will ask which server you want to use.</span></div></div><a className="btn primary" href="/api/discord/connect">Choose server</a></div>}</section>

    <div className="studio-layout"><section className="studio-content">
      <section className="panel"><div className="section-head"><div><span className="section-kicker">TWITCH → DISCORD</span><h2>Live chat sync</h2><p className="muted">Mirror Twitch chat into one Discord text channel automatically.</p></div><span className={`status ${chatSync.enabled?'success':''}`}>{chatSync.enabled?'Sync on':'Sync off'}</span></div>
        {!guild?<div className="status">Connect Discord first.</div>:<><div className="field"><label>Discord chat channel</label><select value={chatSync.channel_id} onChange={e=>{const c=channels.find(x=>x.id===e.target.value);setChatSync(v=>({...v,channel_id:e.target.value,channel_name:c?.name||''}))}}><option value="">Choose channel…</option>{channels.map(c=><option key={c.id} value={c.id}>#{c.name}</option>)}</select></div><div className="row"><label className="check"><input type="checkbox" checked={chatSync.enabled} onChange={e=>setChatSync(v=>({...v,enabled:e.target.checked}))}/>Mirror Twitch chat</label><label className="check"><input type="checkbox" checked={chatSync.include_commands} onChange={e=>setChatSync(v=>({...v,include_commands:e.target.checked}))}/>Include CC! commands</label></div><div className="actions"><button className="btn primary" onClick={saveChatSync}>Save chat sync</button>{chatSync.channel_name?<span className="status success">#{chatSync.channel_name}</span>:null}</div></>}
      </section>

      <section className="panel"><div className="section-head"><div><span className="section-kicker">ROLE SYNC</span><h2>Discord role → chat badge</h2><p className="muted">Choose a Discord role and the CTCI badge it should grant.</p></div><button className="btn primary" disabled={!guild} onClick={sync}>Sync badges now</button></div>{!guild?<div className="status">Install the Discord bot before creating role mappings.</div>:<div className="mapping-row"><div className="field"><label>Discord role</label><select value={rule.role_id} onChange={e=>setRule({...rule,role_id:e.target.value})}><option value="">Choose role…</option>{roles.filter(x=>!x.managed&&x.name!=='@everyone').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="mapping-arrow">→</div><div className="field"><label>CTCI badge</label><select value={rule.badge_id} onChange={e=>setRule({...rule,badge_id:e.target.value})}><option value="">Choose badge…</option>{customBadges.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><button className="btn primary" disabled={!rule.role_id||!rule.badge_id} onClick={addRule}>Add</button></div>}<div className="command-list">{rules.length===0?<div className="plugin-card"><strong>No role mappings yet</strong><p className="small muted">Create a custom badge below, then connect it to a Discord role.</p></div>:rules.map(x=><div className="plugin-card" key={x.id}><div className="plugin-title"><div><strong>{roleName(x.role_id)} → {badgeName(x.badge_id)}</strong><div className="small muted">Synced from {guild?.guild_name||'Discord'}</div></div><button className="btn compact ghost" onClick={()=>removeRule(x.id)}>Remove</button></div></div>)}</div></section>

      <section className="panel"><div className="section-head"><div><span className="section-kicker">BADGE LIBRARY</span><h2>Create your own badges</h2><p className="muted">Staff, VIP, Artist, Subscriber, Friend—make badges that fit your community.</p></div></div><div className="row"><div className="field"><label>Badge name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Community VIP"/></div><div className="field"><label>Short ID</label><input value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})} placeholder="community-vip"/></div></div><div className="row"><div className="field"><label>Badge text</label><input maxLength={12} value={form.icon_text} onChange={e=>setForm({...form,icon_text:e.target.value})} placeholder="VIP"/></div><div className="field"><label>Badge color</label><input type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/></div></div><div className="field"><label>Custom icon URL <span className="muted">optional</span></label><input value={form.icon_url} onChange={e=>setForm({...form,icon_url:e.target.value})} placeholder="https://…"/></div><button className="btn primary" onClick={create}>Create badge</button><hr className="divider"/><div className="plugin-list">{badges.map(b=><div className="plugin-card" key={b.id}><div className="plugin-title"><div><strong>{b.name}</strong><div className="small muted">{b.is_platform?'Official CTCI platform badge':'Your custom badge'}</div></div><span className={`custom-badge ${b.slug==='developer'?'badge-developer':''}`} style={{color:b.color,borderColor:b.color}}>{b.icon_text||b.slug}</span></div></div>)}</div></section>

      <details className="advanced advanced-muted"><summary>Advanced / manual identity tools</summary><div className="advanced-body"><p className="muted small">Most streamers should not need this.</p><div className="row"><div className="field"><label>Manual badge</label><select value={give.badge_id} onChange={e=>setGive({...give,badge_id:e.target.value})}><option value="">Choose badge…</option>{customBadges.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>Twitch login</label><input value={give.twitch_login} onChange={e=>setGive({...give,twitch_login:e.target.value})}/></div></div><button className="btn" onClick={giveBadge}>Assign manually</button><hr className="divider"/><div className="row"><div className="field"><label>Twitch login</label><input value={link.twitch_login} onChange={e=>setLink({...link,twitch_login:e.target.value})}/></div><div className="field"><label>Discord user ID</label><input value={link.discord_user_id} onChange={e=>setLink({...link,discord_user_id:e.target.value})}/></div></div><button className="btn" onClick={addLink}>Save manual member link</button></div></details>
    </section>

    <aside className="studio-sidebar"><section className="panel"><span className="section-kicker">PLUG & PLAY</span><h2>One CTCI bot</h2><p className="muted">Every streamer installs the same official bot into their own server. CTCI stores which server and channel belong to that streamer.</p><div className="divider"/><div className="wizard-step"><strong>No Message Content intent</strong><p>Chat sync originates from Twitch EventSub, so the Discord bot does not need to read Discord messages.</p></div><div className="wizard-step"><strong>No surprise pings</strong><p>Mirrored Twitch messages are sent with Discord mentions disabled.</p></div></section><section className="panel"><h3>Current setup</h3><div className="quick-links"><span className="status success">Developer badge active</span><span className={`status ${guild?'success':''}`}>{guild?'Discord connected':'Discord missing'}</span><span className={`status ${chatSync.enabled?'success':''}`}>{chatSync.enabled?`Twitch → #${chatSync.channel_name}`:'Chat sync off'}</span><span className={`status ${rules.length?'success':''}`}>{rules.length?`${rules.length} role sync${rules.length===1?'':'s'}`:'No role sync yet'}</span></div></section></aside></div>
  </main></>
}
