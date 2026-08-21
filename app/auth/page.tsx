'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage(){
  const router=useRouter(),supabase=useMemo(()=>createClient(),[])
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[manual,setManual]=useState(false),[resetWait,setResetWait]=useState(0)

  function authMessage(value:string){const m=value.toLowerCase();if(m.includes('rate')||m.includes('too many'))return 'Supabase has temporarily rate-limited auth emails. Wait before requesting another email.';return value}
  async function login(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');const{error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});setBusy(false);if(error)return setMessage(authMessage(error.message));router.push('/dashboard')}
  async function resetPassword(){if(!email.trim()){setMessage('Enter your email first.');return}if(resetWait>0){setMessage(`Please wait ${resetWait}s before requesting another reset email.`);return}setBusy(true);const{error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${window.location.origin}/auth/reset`});setBusy(false);if(error){setMessage(authMessage(error.message));return}setMessage('Supabase password-reset email sent. Check your inbox.');setResetWait(60);let left=60;const timer=window.setInterval(()=>{left-=1;setResetWait(left);if(left<=0)window.clearInterval(timer)},1000)}

  return <><div className="shell" style={{paddingBottom:0}}><nav className="nav"><Link href="/" className="brand">CTCI <span>Studio</span></Link><Link href="/" className="btn">Back to home</Link></nav></div><main className="auth-card">
    <div className="status success">Streamer sign-in</div><h1 className="auth-title">Sign in to CTCI.</h1><p className="muted">Use Twitch, or use the verified email + password attached to your existing streamer account through Supabase Auth.</p>
    <a className="btn twitch-btn" href="/api/auth/twitch"><span className="twitch-mark">◆</span>Continue with Twitch</a>
    <button className="btn" type="button" style={{width:'100%',marginTop:10}} onClick={()=>setManual(v=>!v)}>{manual?'Hide email login':'Sign in with Supabase email + password'}</button>
    {manual&&<form className="legacy-auth" onSubmit={login}><div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field"><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/></div>{message&&<p className={`status ${message.toLowerCase().includes('sent')?'success':'danger'}`}>{message}</p>}<div className="actions"><button type="submit" disabled={busy} className="btn primary">{busy?'Signing in…':'Sign in'}</button><button type="button" disabled={busy||resetWait>0} className="btn ghost" onClick={resetPassword}>{resetWait>0?`Reset again in ${resetWait}s`:'Forgot password'}</button></div><p className="small muted">New streamer? Start with Twitch first, then attach a real email in Dashboard → Profile. Email verification, password login and recovery all run through Supabase Auth.</p></form>}
    <p className="small muted auth-note">Twitch OAuth tokens stay server-side. Passwords and auth-email workflows are handled by Supabase Auth and are never stored in CTCI application tables.</p>
  </main></>}
