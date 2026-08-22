import Link from 'next/link'

export default function Home() {
  return <>
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand brand-link" aria-label="CTCI home">
          <span className="brand-mark">C</span>
          <span>CTCI</span>
          <span className="brand-sub">Streamer Studio</span>
        </Link>
        <div className="site-actions">
          <a className="btn ghost" href="https://github.com/Syntax-XXX/CTCI" target="_blank" rel="noreferrer">GitHub</a>
          <Link className="btn primary" href="/auth">Open dashboard</Link>
        </div>
      </div>
    </header>

    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Realtime chat for OBS</span>
        <h1>Make chat feel like part of the stream.</h1>
        <p>CTCI combines Twitch and YouTube chat, streamer-owned styling, custom badges, commands, plugins and a transparent OBS Browser Source in one control center.</p>
        <div className="actions">
          <Link href="/auth" className="btn primary">Open streamer studio</Link>
          <Link href="/dashboard/builder" className="btn">Explore the chat builder</Link>
        </div>
      </section>

      <section className="marketing-grid" aria-label="CTCI platform overview">
        <article className="panel">
          <span className="section-kicker">Broadcast layer</span>
          <h2 className="marketing-section-title">Built for OBS, not just for a dashboard.</h2>
          <p className="muted">Your Browser Source stays lightweight while CTCI handles Realtime chat events, styles, badges and streamer configuration through Supabase.</p>
          <div className="marketing-list">
            <div className="command-card"><strong>Realtime styling</strong><div className="small muted">Fonts, themes, glow, spacing, animations and per-chatter overrides.</div></div>
            <div className="command-card"><strong>Streamer-owned identity</strong><div className="small muted">Custom badges, Discord role mapping and platform-aware chat presentation.</div></div>
            <div className="command-card"><strong>Visual builder</strong><div className="small muted">Build the chat look visually, then extend it with validated custom CSS when needed.</div></div>
          </div>
        </article>

        <aside className="panel">
          <span className="section-kicker">Connected workflow</span>
          <h2 className="marketing-section-title">One studio for the stream.</h2>
          <p className="muted">Connect services once, keep each streamer's settings isolated, and use the same OBS URL while the design evolves.</p>
          <hr className="divider" />
          <div className="plugin-list">
            <div className="plugin-card"><div className="plugin-title"><strong>Twitch</strong><span className="status success">Realtime</span></div><span className="small muted">OAuth, EventSub and chat ingestion</span></div>
            <div className="plugin-card"><div className="plugin-title"><strong>YouTube</strong><span className="status">Optional</span></div><span className="small muted">Live chat discovery and merged-source rendering</span></div>
            <div className="plugin-card"><div className="plugin-title"><strong>OBS</strong><span className="status success">Browser Source</span></div><span className="small muted">Transparent, responsive and session-free public overlay</span></div>
          </div>
        </aside>
      </section>
    </main>
  </>
}
