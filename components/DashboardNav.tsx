'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect,useState } from 'react'
import { PluginDashboardSurface } from '@/components/PluginSurface'

type DashboardNavProps = { onSignOut?: () => void | Promise<void> }
type IconName='overlay'|'builder'|'sources'|'commands'|'badges'|'plugins'|'features'|'profile'|'studio'|'tools'
type NavItem={href:string;label:string;icon:IconName}

const baseItems:NavItem[] = [
  { href: '/dashboard', label: 'Overlay', icon: 'overlay' },
  { href: '/dashboard/builder', label: 'Builder β', icon: 'builder' },
  { href: '/dashboard/chat', label: 'Sources', icon: 'sources' },
  { href: '/dashboard/commands', label: 'Commands', icon: 'commands' },
  { href: '/dashboard/badges', label: 'Badges', icon: 'badges' },
  { href: '/dashboard/plugins', label: 'Plugins', icon: 'plugins' },
  { href: '/dashboard/features', label: 'Features', icon: 'features' },
  { href: '/dashboard/profile', label: 'Profile β', icon: 'profile' },
]

export default function DashboardNav({ onSignOut }: DashboardNavProps) {
  const pathname = usePathname(),[syncing,setSyncing]=useState(false),[flags,setFlags]=useState<Record<string,boolean>>({})
  const extensionPlacement=pathname==='/dashboard'?'overview':pathname.startsWith('/dashboard/badges')?'badges':null
  useEffect(()=>{void fetch('/api/features',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(b=>{if(b?.flags)setFlags(b.flags)}).catch(()=>{})},[])
  const items:NavItem[]=[...baseItems]
  if(flags.chat_studio)items.splice(2,0,{href:'/dashboard/studio',label:'Chat Studio',icon:'studio'})
  if(flags.stream_tools)items.splice(flags.chat_studio?4:3,0,{href:'/dashboard/tools',label:'Stream Tools',icon:'tools'})

  async function syncDiscord(){setSyncing(true);try{const res=await fetch('/api/discord/sync',{method:'POST'}),body=await res.json();if(!res.ok){window.alert(body.error||'Discord bot sync failed');return}const badgeRes=await fetch('/api/badges/discord-sync',{method:'POST'}),badgeBody=await badgeRes.json().catch(()=>({})),badgeText=badgeRes.ok?` · badges +${badgeBody.granted||0}/-${badgeBody.removed||0}`:'';window.alert(`Discord synced: ${body.guild?.name||'server'} · ${body.roles} roles · ${body.channels} channels${badgeText}`);window.location.reload()}finally{setSyncing(false)}}

  return <>
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/dashboard" className="brand brand-link" aria-label="CTCI dashboard"><span className="brand-mark">C</span><span>CTCI</span><span className="brand-sub">Streamer Studio</span></Link>
        <nav className="app-tabs" aria-label="Dashboard sections">
          {items.map(item=>{const active=item.href==='/dashboard'?pathname===item.href:pathname.startsWith(item.href);return <Link key={item.href} href={item.href} className={`app-tab${active?' active':''}`} aria-current={active?'page':undefined}><NavIcon name={item.icon}/><span>{item.label}</span></Link>})}
        </nav>
        <div className="app-header-actions">
          <a className="btn compact ghost" href="/api/discord/connect">Discord setup</a>
          <button className="btn compact primary" type="button" disabled={syncing} onClick={syncDiscord}>{syncing?'Syncing…':'Sync Discord'}</button>
          {onSignOut?<button className="btn compact ghost" onClick={onSignOut}>Sign out</button>:null}
        </div>
      </div>
    </header>
    {extensionPlacement?<div className="app-main plugin-extension-wrap"><PluginDashboardSurface placement={extensionPlacement}/></div>:null}
  </>
}

function NavIcon({name}:{name:IconName}){
  const common={width:15,height:15,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(name==='overlay')return <span className="app-tab-icon"><svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6"/></svg></span>
  if(name==='builder')return <span className="app-tab-icon"><svg {...common}><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></span>
  if(name==='sources')return <span className="app-tab-icon"><svg {...common}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a6 6 0 0 1 6 6v4M6 8v8a2 2 0 0 0 2 2h8"/></svg></span>
  if(name==='commands')return <span className="app-tab-icon"><svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></svg></span>
  if(name==='badges')return <span className="app-tab-icon"><svg {...common}><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9.5 12 1.7 1.7 3.5-3.7"/></svg></span>
  if(name==='plugins')return <span className="app-tab-icon"><svg {...common}><path d="M9 3v4H5v4H3v4h4v4h4v2h4v-4h4v-4h2V9h-4V5h-4V3H9Z"/></svg></span>
  if(name==='features')return <span className="app-tab-icon"><svg {...common}><path d="M4 7h10M18 7h2M4 17h4M12 17h8M4 12h3M11 12h9"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="10" cy="17" r="2"/></svg></span>
  if(name==='profile')return <span className="app-tab-icon"><svg {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6"/></svg></span>
  if(name==='studio')return <span className="app-tab-icon"><svg {...common}><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg></span>
  return <span className="app-tab-icon"><svg {...common}><path d="m14 4 6 6-9 9H5v-6l9-9Z"/><path d="m12 6 6 6"/></svg></span>
}
