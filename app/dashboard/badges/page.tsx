'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

type Badge={id:string;slug:string;name:string;icon_text:string|null;icon_url:string|null;color:string;is_platform:boolean}
type Rule={id:string;badge_id:string;guild_id:string;role_id:string;enabled:boolean}
type Role={id:string;name:string;color:number;position:number;managed:boolean}
type Guild={guild_id:string;guild_name:string;guild_icon:string|null}
type DLink={id:string;twitch_login:string;discord_user_id:string}

export default function BadgesPage(){
  const sb=useMemo(()=>createClient(),[]),router=useRouter()
  const[owner,setOwner]=useState(''),[badges,setBadges]=useState<Badge[]>([]),[rules,setRules]=useState<Rule[]>([]),[links,setLinks]=useState<DLink[]>([]),[guild,setGuild]=useState<Guild|null>(null),[roles,setRoles]=useState<Role[]>([]),[status,setStatus]=useState('Loading Discord setup…')
  const[form,setForm]=useState({name:'',slug:'',icon_text:'',icon_url:'',color:'#8B5CF6'}),[give,setGive]=useState({badge_id:'',twitch_login:''}),[rule,setRule]=useState({badge_id:'',role_id:''}),[link,setLink]=useState({twitch_login:'',discord_user_id:''})

  async function load(){
    const{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}setOwner(user.id)
    const[b,ru,li,g]=await Promise.all([
      sb.from('badge_definitions').select('*').or(`owner_id.is.null,owner_id.eq.${user.id}`).order('created_at'),
      sb.from('discord_badge_sync').select('*').eq('owner_id',user.id),
      sb.from('discord_user_links').select('id,twitch_login,discord_user_id').eq('owner_id',user.id),
      sb.from('discord_guild_connections').select('guild_id,guild_name,guild_icon').eq('owner_id',user.id).maybeSingle(),
    ])
    setBadges((b.data||[])as Badge[]);setRules((ru.data||[])as Rule[]);setLinks((li.data||[])as DLink[]);setGuild(g.data as Guild|null)
    if(g.data){const rr=await fetch('/api/discord/roles',{cache:'no-store'}),body=await rr.json();setRoles(rr.ok?(body.roles||[]):[]);setStatus(rr.ok?'Discord ready':body.error||'Could not load Discord roles')}else{setRoles([]);setStatus('Install the CTCI bot to get started')}
  }
  useEffect(()=>{load()},[])

  async function create(){if(!form.name.trim()||!form.slug.trim()){setStatus('Give the badge a name and slug first');return}const{error}=await sb.from('badge_definitions').insert({owner_id:owner,name:form.name.trim(),slug:form.slug.trim().toLowerCase(),icon_text:form.icon_text.trim()||null,icon_url:form.icon_url.trim()||null,color:form.color,is_platform:false});setStatus(error?error.message:'Badge created');if(!error){setForm({name:'',slug:'',icon_text:'',icon_url:'',color:'#8B5CF6'});await load()}}
  async function giveBadge(){const{error}=await sb.from('badge_assignments').insert({owner_id:owner,badge_id:give.badge_id,twitch_login:give.twitch_login.trim().toLowerCase(),source:'manual'});setStatus(error?error.message:'Badge assigned')}
  async function addRule(){if(!guild){setStatus('Install the Discord bot first');return}if(!rule.badge_id||!rule.role_id){setStatus('Choose a Discord role and a CTCI badge');return}const{error}=await sb.from('discord_badge_sync').insert({owner_id:owner,badge_id:rule.badge_id,guild_id:guild.guild_id,role_id:rule.role_id,enabled:true});setStatus(error?error.message:'Role sync added');if(!error){setRule({badge_id:'',role_id:''});await load()}}
  async function removeRule(id:string){const{error}=await sb.from('discord_badge_sync').delete().eq('id',id).eq('owner_id',owner);setStatus(error?error.message:'Role sync removed');if(!error)await load()}
  async function addLink(){const{error}=await sb.from('discord_user_links').upsert({owner_id:owner,twitch_login:link.twitch_login.trim().toLowerCase(),discord_user_id:link.discord_user_id.trim()},{onConflict:'owner_id,twitch_login'});setStatus(error?error.message:'Member link saved');if(!error)await load()}
  async function sync(){setStatus('Syncing badges from Discord…');const res=await fetch('/api/badges/discord-sync',{method:'POST'}),body=await res.json();setStatus(res.ok?`Sync complete · ${body.granted} added · ${body.removed} removed`:(body.error||'Sync failed'))}
  async function signOut(){await sb.auth.signOut();router.replace('/')}
  const customBadges=badges.filter(b=>!b.is_platform),roleName=(id:string)=>roles.find(r=>r.id===id)?.name||'Discord role',badgeName=(id:string)=>badges.find(b=>b.id===id)?.name||'Badge'

  return <>
    <DashboardNav onSignOut={signOut}/>
    <main className="app-main">
      <section className="dashboard-hero"><div><span className="eyebrow">DISCORD BADGES</span><h1>Install once. Sync automatically.</h1><p>CTCI uses one official Discord bot. Every streamer installs that same bot into their own server, then maps roles to chat badges with simple dropdowns.</p></div><div className="hero-status"><span className={`health-dot ${guild?'online':''}`}/><div><strong>{guild?guild.guild_name:'Discord not connected'}</strong><span>{status}</span></div></div></section>

      <section className="panel discord-setup" id="discord">
        <div className="section-head"><div><span className="section-kicker">PLUG & PLAY</span><h2>Discord server connection</h2><p className="muted">No bot token, Guild ID, or Role ID is required from the streamer.</p></div><a className="btn primary" href="/api/discord/connect">{guild?'Change Discord server':'Install CTCI bot'}</a></div>
        {guild?<div className="discord-connected"><div className="discord-server"><div className="discord-server-icon">D</div><div><strong>{guild.guild_name}</strong><span>CTCI bot installed · {roles.length} roles available</span></div></div><span className="status success">Connected</span></div>:<div className="discord-connected"><div className="discord-server"><div className="discord-server-icon">D</div><div><strong>Add CTCI to your streamer server</strong><span>Discord will ask which server you want to install the bot into.</span></div></div><a className="btn primary" href="/api/discord/connect">Choose server</a></div>}
        <div className="wizard-steps"><div className="wizard-step"><strong>1 · Install bot</strong><p>Choose your Discord server in the official Discord authorization screen.</p></div><div className="wizard-step"><strong>2 · Map roles</strong><p>Select a Discord role and the badge it should grant in Twitch chat.</p></div><div className="wizard-step"><strong>3 · Sync</strong><p>CTCI checks role membership and keeps matching chat badges up to date.</p></div></div>
      </section>

      <div className="studio-layout">
        <section className="studio-content">
          <section className="panel"><div className="section-head"><div><span className="section-kicker">ROLE SYNC</span><h2>Discord role → chat badge</h2><p className="muted">This is the only mapping most streamers need.</p></div><button className="btn primary" disabled={!guild} onClick={sync}>Sync now</button></div>
            {!guild?<div className="status">Install the Discord bot before creating role mappings.</div>:<div className="mapping-row"><div className="field"><label>Discord role</label><select value={rule.role_id} onChange={e=>setRule({...rule,role_id:e.target.value})}><option value="">Choose role…</option>{roles.filter(x=>!x.managed&&x.name!=='@everyone').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="mapping-arrow">→</div><div className="field"><label>CTCI badge</label><select value={rule.badge_id} onChange={e=>setRule({...rule,badge_id:e.target.value})}><option value="">Choose badge…</option>{customBadges.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><button className="btn primary" disabled={!rule.role_id||!rule.badge_id} onClick={addRule}>Add</button></div>}
            <div className="command-list">{rules.length===0?<div className="plugin-card"><strong>No role mappings yet</strong><p className="small muted">Create a custom badge below, then connect it to a Discord role.</p></div>:rules.map(x=><div className="plugin-card" key={x.id}><div className="plugin-title"><div><strong>{roleName(x.role_id)} → {badgeName(x.badge_id)}</strong><div className="small muted">Automatically synced from {guild?.guild_name||'Discord'}</div></div><button className="btn compact ghost" onClick={()=>removeRule(x.id)}>Remove</button></div></div>)}</div>
          </section>

          <section className="panel"><div className="section-head"><div><span className="section-kicker">BADGE LIBRARY</span><h2>Create your own badges</h2><p className="muted">Staff, VIP, Artist, Subscriber, Friend—make badges that fit your community.</p></div></div><div className="row"><div className="field"><label>Badge name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Community VIP"/></div><div className="field"><label>Short ID</label><input value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})} placeholder="community-vip"/></div></div><div className="row"><div className="field"><label>Badge text</label><input maxLength={12} value={form.icon_text} onChange={e=>setForm({...form,icon_text:e.target.value})} placeholder="VIP"/></div><div className="field"><label>Badge color</label><input type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/></div></div><div className="field"><label>Custom icon URL <span className="muted">optional</span></label><input value={form.icon_url} onChange={e=>setForm({...form,icon_url:e.target.value})} placeholder="https://…"/></div><button className="btn primary" onClick={create}>Create badge</button><hr className="divider"/><div className="plugin-list">{badges.map(b=><div className="plugin-card" key={b.id}><div className="plugin-title"><div><strong>{b.name}</strong><div className="small muted">{b.is_platform?'Official CTCI platform badge':'Your custom badge'}</div></div><span className={`custom-badge ${b.slug==='developer'?'badge-developer':''}`} style={{color:b.color,borderColor:b.color}}>{b.icon_text||b.slug}</span></div></div>)}</div></section>

          <details className="advanced advanced-muted"><summary>Advanced / manual identity tools</summary><div className="advanced-body"><p className="muted small">Most streamers should not need this section. It exists for manual recovery and custom workflows.</p><div className="row"><div className="field"><label>Manual badge</label><select value={give.badge_id} onChange={e=>setGive({...give,badge_id:e.target.value})}><option value="">Choose badge…</option>{customBadges.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>Twitch login</label><input value={give.twitch_login} onChange={e=>setGive({...give,twitch_login:e.target.value})}/></div></div><button className="btn" onClick={giveBadge}>Assign manually</button><hr className="divider"/><div className="row"><div className="field"><label>Twitch login</label><input value={link.twitch_login} onChange={e=>setLink({...link,twitch_login:e.target.value})}/></div><div className="field"><label>Discord user ID</label><input value={link.discord_user_id} onChange={e=>setLink({...link,discord_user_id:e.target.value})}/></div></div><button className="btn" onClick={addLink}>Save manual member link</button></div></details>
        </section>

        <aside className="studio-sidebar"><section className="panel"><span className="section-kicker">HOW IT WORKS</span><h2>One bot for every streamer</h2><p className="muted">CTCI owns and operates the bot application. Streamers only authorize it into their own server. Bot secrets never leave CTCI.</p><div className="divider"/><div className="wizard-step"><strong>Safe by default</strong><p>The bot only reads the connected server needed for badge synchronization and does not need message content access.</p></div><div className="wizard-step"><strong>Server isolated</strong><p>Each CTCI account is tied to its own selected Discord server and role mappings.</p></div></section><section className="panel"><h3>Current setup</h3><div className="quick-links"><span className="status success">Developer badge active</span><span className={`status ${guild?'success':''}`}>{guild?'Discord connected':'Discord missing'}</span><span className={`status ${rules.length?'success':''}`}>{rules.length?`${rules.length} role sync${rules.length===1?'':'s'}`:'No role sync yet'}</span></div></section></aside>
      </div>
    </main>
  </>
}
