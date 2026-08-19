'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type DashboardNavProps = {
  onSignOut?: () => void | Promise<void>
}

const items = [
  { href: '/dashboard', label: 'Overlay', icon: '◫' },
  { href: '/dashboard/commands', label: 'Commands', icon: '⌘' },
  { href: '/dashboard/badges', label: 'Badges', icon: '◆' },
  { href: '/dashboard/plugins', label: 'Plugins', icon: '◈' },
]

export default function DashboardNav({ onSignOut }: DashboardNavProps) {
  const pathname = usePathname()
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/dashboard" className="brand brand-link" aria-label="CTCI dashboard">
          <span className="brand-mark">C</span>
          <span>CTCI</span>
          <span className="brand-sub">Streamer Studio</span>
        </Link>
        <nav className="app-tabs" aria-label="Dashboard sections">
          {items.map(item => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)
            return <Link key={item.href} href={item.href} className={`app-tab${active ? ' active' : ''}`}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </Link>
          })}
        </nav>
        <div className="app-header-actions">
          <a className="btn compact" href="/dashboard/badges#discord">Discord setup</a>
          {onSignOut ? <button className="btn compact ghost" onClick={onSignOut}>Sign out</button> : null}
        </div>
      </div>
    </header>
  )
}
