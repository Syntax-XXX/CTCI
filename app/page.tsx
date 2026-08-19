import Link from 'next/link'

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav"><div className="brand">CTCI <span>Chat</span></div><Link className="btn" href="/auth">Open dashboard</Link></nav>
      <section className="hero">
        <div className="status">Custom Twitch Chat Interface · OBS Browser Source</div>
        <h1>Build a Twitch chat overlay that actually looks like your stream.</h1>
        <p>Customize typography, message bubbles, badges, animations, per-chatter styling, colors, spacing and your public OBS overlay URL. Settings are stored securely in Supabase.</p>
        <div className="actions"><Link href="/auth" className="btn primary">Create / sign in</Link><a className="btn" href="https://github.com/Syntax-XXX/CTCI">GitHub</a></div>
      </section>
    </main>
  )
}
