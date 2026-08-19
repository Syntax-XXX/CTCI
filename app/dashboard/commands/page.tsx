'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type CommandConfig={id?:string;command_name:string;enabled:boolean;aliases:string[];permissions:string[];global_cooldown_seconds:number;user_cooldown_seconds:number;source:string;plugin_id:string|null;usage_count:number}
const BUILTINS=['font','fontsize','color','namecolor','background','opacity','animation','maxmessages','lifetime','reset','help','plugins']
const DEFAULTS:Record<string,Partial<CommandConfig>>={
  font:{permissions:['broadcaster']},fontsize:{permissions:['broadcaster']},color:{permissions:['broadcaster','moderator']},namecolor:{permissions:['broadcaster']},background:{permissions:['broadcaster']},opacity:{permissions:['broadcaster']},animation:{permissions:['broadcaster']},maxmessages:{permissions:['broadcaster']},lifetime:{permissions:['broadcaster']},reset:{permissions:['broadcaster'],global_cooldown_seconds:5,user_cooldown_seconds:5},help:{permissions:['viewer','subscriber','vip','moderator','broadcaster'],global_cooldown_seconds:2,user_cooldown_seconds:10},plugins:{permissions:['viewer','subscriber','vip','moderator','broadcaster']}
}
const ROLES=['broadcaster','moderator','vip','subscriber','viewer']

export default function CommandsPage(){
 const supabase=useMemo(()=>createClient(),[]);const router=useRouter();const [ownerId,setOwnerId]=useState('');const [prefix,setPrefix]=useState('CC!');const [rows,setRows]=useState<CommandConfig[]>([]);const [status,setStatus]=useState('Loading…')
 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/auth');return}setOwnerId(user.id);const [o,c]=await Promise.all([supabase.from('overlays').select('command_prefix').eq('user_id',user.id).single(),supabase.from('command_configurations').select('*').eq('owner_id',user.id).order('command_name')]);setPrefix(o.data?.command_prefix||'CC!');const byName=new Map((c.data||[]).map((x:any)=>[x.command_name,x]));setRows(BUILTINS.map(name=>normalize(name,byName.get(name) as any)).concat((c.data||[]).filter((x:any)=>!BUILTINS.includes(x.command_name)).map((x:any)=>normalize(x.command_name,x))));setStatus('Ready')})()},[router,supabase])
 async function savePrefix(){if(!ownerId)return;const clean=prefix.trim();if(!clean||clean.length>8){setStatus('Prefix must be 1–8 characters');return}const {error}=await supabase.from('overlays').update({command_prefix:clean}).eq('user_id',ownerId);setStatus(error?error.message:'Prefix saved')}
 async function save(row:CommandConfig){if(!ownerId)return;setStatus(`Saving ${row.command_name}…`);const {error}=await supabase.from('command_configurations').upsert({...row,owner_id:ownerId},{onConflict:'owner_id,command_name'});setStatus(error?error.message:`${prefix}${row.command_name} saved`)}
 function patch(name:string,p:Partial<CommandConfig>){setRows(v=>v.map(x=>x.command_name===name?{...x,...p}:x))}
 return <main className="shell"><nav className="nav"><div className="brand">CTCI <span>Commands</span></div><div className="actions"><Link className="btn" href="/dashboard">Overlay</Link><Link className="btn" href="/dashboard/plugins">Plugins</Link></div></nav>
 <section className="panel"><div className="section-head"><div><h2>Chat command engine</h2><p className="muted">Configure commands that run directly from Twitch chat.</p></div><span className="status">{status}</span></div>
 <div className="row"><div className="field"><label>Command prefix</label><input value={prefix} maxLength={8} onChange={e=>setPrefix(e.target.value)}/></div><div className="actions"><button className="btn primary" onClick={savePrefix}>Save prefix</button></div></div>
 <div className="command-list">{rows.map(row=><article className="command-card" key={row.command_name}><div className="command-title"><code>{prefix}{row.command_name}</code><span className="small muted">{row.source}{row.plugin_id?` · ${row.plugin_id}`:''} · {row.usage_count||0} uses</span></div>
 <div className="row"><label className="check"><input type="checkbox" checked={row.enabled} onChange={e=>patch(row.command_name,{enabled:e.target.checked})}/>Enabled</label><div className="field"><label>Aliases (comma separated)</label><input value={row.aliases.join(', ')} onChange={e=>patch(row.command_name,{aliases:e.target.value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)})}/></div></div>
 <div className="field"><label>Allowed roles</label><div className="role-grid">{ROLES.map(role=><label className="check" key={role}><input type="checkbox" checked={row.permissions.includes(role)} onChange={e=>patch(row.command_name,{permissions:e.target.checked?[...new Set([...row.permissions,role])]:row.permissions.filter(x=>x!==role)})}/>{role}</label>)}</div></div>
 <div className="row"><div className="field"><label>Global cooldown (sec)</label><input type="number" min={0} max={3600} value={row.global_cooldown_seconds} onChange={e=>patch(row.command_name,{global_cooldown_seconds:Number(e.target.value)})}/></div><div className="field"><label>Per-user cooldown (sec)</label><input type="number" min={0} max={86400} value={row.user_cooldown_seconds} onChange={e=>patch(row.command_name,{user_cooldown_seconds:Number(e.target.value)})}/></div></div>
 <button className="btn" onClick={()=>save(row)}>Save command</button></article>)}</div></section></main>
}
function normalize(name:string,row:any):CommandConfig{const d=DEFAULTS[name]||{};return {command_name:name,enabled:row?.enabled??true,aliases:row?.aliases??[],permissions:row?.permissions??d.permissions??['broadcaster'],global_cooldown_seconds:row?.global_cooldown_seconds??d.global_cooldown_seconds??1,user_cooldown_seconds:row?.user_cooldown_seconds??d.user_cooldown_seconds??5,source:row?.source??'core',plugin_id:row?.plugin_id??null,usage_count:Number(row?.usage_count||0),id:row?.id}}
