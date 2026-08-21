'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect,useState } from 'react'
import { PluginDashboardSurface } from '@/components/PluginSurface'

type DashboardNavProps = { onSignOut?: () => void | Promise<void> }
const baseItems = [
  { href: '/dashboard', label: 'Overlay', icon: '◫' },
  { href: '/dashboard/builder', label: 'Builder β', icon: '✎' },
  { href: '/dashboard/chat', label: 'Sources', icon: '⇄' },
  { href: '/dashboard/commands', label: 'Commands', icon: '⌘' },
  { href: '/dashboard/badges', label: 'Badges', icon: '◆' },
  { href: '/dashboard/plugins', label: 'Plugins', icon: '◈' },
  { href: '/dashboard/features', label: 'Features', icon: '⚙' },
  { href: '/dashboard/profile', label: 'Profile β', icon: '●' },
]
export default function DashboardNav({ onSignOut }: DashboardNavProps) {
  const pathname = usePathname(),[syncing,setSyncing]=useState(false),[flags,setFlags]=useState<Record<string,boolean>>({})
  const extensionPlacement=pathname==='/dashboard'?'overview':pathname.startsWith('/dashboard/badges')?'badges':null
  useEffect(()=>{void fetch('/api/features',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(b=>{if(b?.flags)setFlags(b.flags)}).catch(()=>{})},[])
  const items=[...baseItems]
  if(flags.chat_studio)items.splice(2,0,{href:'/dashboard/studio',label:'Chat Studio',icon:'◉'})
  if(flags.stream_tools)items.splice(flags.chat_studio?4:3,0,{href:'/dashboard/tools',label:'Stream Tools',icon:'✦'})
  async function syncDiscord(){setSyncing(true);try{const res=await fetch('/api/discord/sync',{method:'POST'}),body=await res.json();if(!res.ok){window.alert(body.error||'Discord bot sync failed');return}const badgeRes=await fetch('/api/badges/discord-sync',{method:'POST'}),badgeBody=await badgeRes.json().catch(()=>({})),badgeText=badgeRes.ok?` · badges +${badgeBody.granted||0}/-${badgeBody.removed||0}`:'';window.alert(`Discord synced: ${body.guild?.name||'server'} · ${body.roles} roles · ${body.channels} channels${badgeText}`);window.location.reload()}finally{setSyncing(false)}}
  return <><header className="app-header"><div className="app-header-inner"><Link href="/dashboard" className="brand brand-link" aria-label="CTCI dashboard"><span className="brand-mark">C</span><span>CTCI</span><span className="brand-sub">Streamer Studio</span></Link><nav className="app-tabs" aria-label="Dashboard sections">{items.map(item=>{const active=item.href==='/dashboard'?pathname===item.href:pathname.startsWith(item.href);return <Link key={item.href} href={item.href} className={`app-tab${active?' active':''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>})}</nav><div className="app-header-actions"><a className="btn compact" href="/api/discord/connect">Install / change Discord</a><button className="btn compact primary" type="button" disabled={syncing} onClick={syncDiscord}>{syncing?'Syncing…':'Sync Discord Bot'}</button>{onSignOut?<button className="btn compact ghost" onClick={onSignOut}>Sign out</button>:null}</div></div></header>{extensionPlacement?<div className="app-main" style={{paddingBottom:0}}><PluginDashboardSurface placement={extensionPlacement}/></div>:null}</>
}
