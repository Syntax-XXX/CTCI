'use client'

import { SyntheticEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showLegacy, setShowLegacy] = useState(false)

  async function submit(e: SyntheticEvent, mode: 'login' | 'signup') {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (result.error) return setMessage(result.error.message)
    if (mode === 'signup' && !result.data.session) return setMessage('Account created. Check your email to confirm it, then sign in.')
    router.push('/dashboard')
  }

  return <>
    <div className="shell" style={{ paddingBottom: 0 }}>
      <nav className="nav">
        <Link href="/" className="brand">CTCI <span>Studio</span></Link>
        <Link href="/" className="btn">Back to home</Link>
      </nav>
    </div>

    <main className="auth-card">
      <div className="status success">Streamer sign-in</div>
      <h1 className="auth-title">Connect your Twitch channel.</h1>
      <p className="muted">Your Twitch account becomes your CTCI identity. We connect your channel, create the dashboard session, and prepare your realtime OBS overlay in one flow.</p>

      <a className="btn twitch-btn" href="/api/auth/twitch">
        <span className="twitch-mark">◆</span>
        Continue with Twitch
      </a>

      <p className="small muted auth-note">CTCI uses one application-wide Twitch app. Your personal OAuth tokens remain private on the server and are never included in the OBS URL.</p>

      <div className="command-list" style={{ marginTop: 20 }}>
        <div className="command-card"><strong>One-click channel connection</strong><div className="small muted">No separate Twitch Client ID setup per streamer.</div></div>
        <div className="command-card"><strong>Private server-side credentials</strong><div className="small muted">OAuth tokens never reach your Browser Source.</div></div>
      </div>

      <button className="link-button" type="button" onClick={()=>setShowLegacy(v=>!v)}>{showLegacy?'Hide email login':'Use legacy email login'}</button>

      {showLegacy&&<form className="legacy-auth">
        <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></div>
        {message && <p className="status danger">{message}</p>}
        <div className="actions">
          <button type="submit" disabled={busy} className="btn primary" onClick={e=>submit(e,'login')}>Sign in</button>
          <button type="button" disabled={busy} className="btn" onClick={e=>submit(e,'signup')}>Create account</button>
        </div>
      </form>}
    </main>
  </>
}
