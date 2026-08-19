import Link from 'next/link'

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand">CTCI <span>Studio</span></div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn" href="https://github.com/Syntax-XXX/CTCI">GitHub</a>
          <Link className="btn primary" href="/auth">Open dashboard</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="status success">Realtime Twitch chat · OBS ready</div>
        <h1>Your stream chat, designed like part of the show.</h1>
        <p>CTCI turns Twitch chat into a fully customizable broadcast layer with live typography, custom badges, Discord role sync, commands, per-user styles, animations and a dedicated OBS Browser Source.</p>
        <div className="actions">
          <Link href="/auth" className="btn primary">Connect Twitch</Link>
          <Link href="/dashboard/badges" className="btn">Badge system</Link>
          <Link href="/dashboard/commands" className="btn">Chat commands</Link>
        </div>
      </section>

      <section className="grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <div className="status">Overlay control</div>
          <h2 style={{ marginTop: 18 }}>Built for OBS, not just a web dashboard.</h2>
          <p className="muted">Changes flow through Supabase Realtime directly into the Browser Source. Fonts, colors, density, animations and chatter-specific styles update without refreshing OBS.</p>
          <div className="command-list" style={{ marginTop: 20 }}>
            <div className="command-card"><strong>Realtime styling</strong><div className="small muted">Typography, themes, glow, rainbow, spacing and animations.</div></div>
            <div className="command-card"><strong>Custom badges</strong><div className="small muted">Platform badges, streamer badges and Discord role synchronization.</div></div>
            <div className="command-card"><strong>Twitch commands</strong><div className="small muted">Permissions, aliases, distributed cooldowns and audit history.</div></div>
          </div>
        </div>

        <aside className="panel">
          <div className="status success">Connected ecosystem</div>
          <h2 style={{ marginTop: 18 }}>One control center.</h2>
          <p className="muted">Twitch powers identity and chat. Discord can supply community roles. CTCI combines both into a single streamer-owned configuration.</p>
          <hr className="divider" />
          <div className="plugin-list">
            <div className="plugin-card"><div className="plugin-title"><strong>Twitch</strong><span className="status success">Live</span></div><span className="small muted">OAuth, EventSub and chat ingestion</span></div>
            <div className="plugin-card"><div className="plugin-title"><strong>Discord</strong><span className="status">Per streamer</span></div><span className="small muted">One connected guild with role → badge mapping</span></div>
            <div className="plugin-card"><div className="plugin-title"><strong>OBS</strong><span className="status success">Realtime</span></div><span className="small muted">Transparent Browser Source rendering</span></div>
          </div>
        </aside>
      </section>
    </main>
  )
}
