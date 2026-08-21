'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage(){
  const router=useRouter(),supabase=useMemo(()=>createClient(),[])
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[manual,setManual]=useState(false)

  async function login(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');const{error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});setBusy(false);if(error)return setMessage(error.message);router.push('/dashboard')}
  async function resetPassword(){if(!email.trim()){setMessage('Enter your email first.');return}setBusy(true);const{error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${window.location.origin}/auth/reset`});setBusy(false);setMessage(error?error.message:'Password-reset email sent. Check your inbox.')}

  return <><div className="shell" style={{paddingBottom:0}}><nav className="nav"><Link href="/" className="brand">CTCI <span>Studio</span></Link><Link href="/" className="btn">Back to home</Link></nav></div><main className="auth-card">
    <div className="status success">Streamer sign-in</div><h1 className="auth-title">Sign in to CTCI.</h1><p className="muted">Use Twitch, or use the email + password you added from Dashboard → Profile. Both methods open the same streamer account.</p>
    <a className="btn twitch-btn" href="/api/auth/twitch"><span className="twitch-mark">◆</span>Continue with Twitch</a>
    <button className="btn" type="button" style={{width:'100%',marginTop:10}} onClick={()=>setManual(v=>!v)}>{manual?'Hide email login':'Sign in with email + password'}</button>
    {manual&&<form className="legacy-auth" onSubmit={login}><div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field"><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/></div>{message&&<p className={`status ${message.toLowerCase().includes('sent')?'success':'danger'}`}>{message}</p>}<div className="actions"><button type="submit" disabled={busy} className="btn primary">{busy?'Signing in…':'Sign in'}</button><button type="button" disabled={busy} className="btn ghost" onClick={resetPassword}>Forgot password</button></div><p className="small muted">New streamer? Start with Twitch first, then add a real email and password in your Profile. This prevents duplicate CTCI accounts.</p></form>}
    <p className="small muted auth-note">Twitch OAuth tokens and passwords stay private. Passwords are handled by Supabase Auth and are never stored in CTCI tables.</p>
  </main></>}
