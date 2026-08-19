'use client'

import { SyntheticEvent, useMemo, useState } from 'react'
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

  return <main className="auth-card">
    <div className="brand">CTCI <span>Chat</span></div>
    <h1 className="auth-title">Sign in with Twitch</h1>
    <p className="muted">One Twitch authorization creates your CTCI account, connects your channel, and enables chat ingestion for your overlay.</p>

    <a className="btn twitch-btn" href="/api/auth/twitch">
      <span className="twitch-mark">◈</span>
      Continue with Twitch
    </a>
    <p className="small muted auth-note">CTCI uses one application-wide Twitch Client ID. Every streamer authorizes that same app and receives their own private OAuth tokens.</p>

    <button className="link-button" type="button" onClick={()=>setShowLegacy(v=>!v)}>{showLegacy?'Hide email login':'Use legacy email login'}</button>

    {showLegacy&&<form className="legacy-auth">
      <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
      <div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></div>
      {message && <p className="status">{message}</p>}
      <div className="actions">
        <button type="submit" disabled={busy} className="btn primary" onClick={e=>submit(e,'login')}>Sign in</button>
        <button type="button" disabled={busy} className="btn" onClick={e=>submit(e,'signup')}>Create account</button>
      </div>
    </form>}
  </main>
}
