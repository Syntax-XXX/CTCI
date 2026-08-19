'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent, mode: 'login' | 'signup') {
    e.preventDefault(); setBusy(true); setMessage('')
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
    <p className="muted">Sign in to configure your Twitch overlay.</p>
    <form>
      <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
      <div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></div>
      {message && <p className="status">{message}</p>}
      <div className="actions">
        <button disabled={busy} className="btn primary" onClick={e=>submit(e,'login')}>Sign in</button>
        <button disabled={busy} className="btn" onClick={e=>submit(e,'signup')}>Create account</button>
      </div>
    </form>
  </main>
}
