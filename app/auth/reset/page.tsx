'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage(){
  const supabase=useMemo(()=>createClient(),[]),router=useRouter()
  const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[status,setStatus]=useState('Checking recovery session…'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false)
  useEffect(()=>{void supabase.auth.getSession().then(({data})=>{setReady(!!data.session);setStatus(data.session?'Choose a new password.':'Recovery session unavailable. Open the newest password-reset link from your email.')})},[supabase])
  async function submit(e:FormEvent){e.preventDefault();if(password.length<12){setStatus('Use at least 12 characters.');return}if(password!==confirm){setStatus('Passwords do not match.');return}setBusy(true);const{error}=await supabase.auth.updateUser({password});setBusy(false);if(error){setStatus(error.message);return}setStatus('Password changed. Redirecting to your dashboard…');window.setTimeout(()=>router.replace('/dashboard/profile'),800)}
  return <main className="auth-card"><div className="status success">Account recovery</div><h1 className="auth-title">Set a new password</h1><p className="muted">{status}</p>{ready&&<form className="legacy-auth" onSubmit={submit}><div className="field"><label>New password</label><input type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/></div><div className="field"><label>Confirm password</label><input type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></div><button className="btn primary" disabled={busy}>{busy?'Updating…':'Set password'}</button></form>}<Link className="btn ghost" href="/auth" style={{marginTop:12}}>Back to sign in</Link></main>
}
