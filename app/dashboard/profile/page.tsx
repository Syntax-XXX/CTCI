'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

type AccountState={email:string;displayName:string;twitchLogin:string;avatarUrl:string;internalEmail:boolean;emailConfirmed:boolean;createdAt:string;lastSignIn:string}
const internalEmail=(email:string)=>/^twitch-[^@]+@auth\.chromachat\.syntax-xxx\.is-a\.dev$/i.test(email)
const EMAIL_COOLDOWN_MS=60_000

export default function ProfilePage(){
  const supabase=useMemo(()=>createClient(),[]),router=useRouter()
  const[account,setAccount]=useState<AccountState|null>(null)
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('')
  const[status,setStatus]=useState('Loading account…'),[busy,setBusy]=useState(false),[emailCooldown,setEmailCooldown]=useState(0)

  useEffect(()=>{let timer:number|undefined;void load();const raw=Number(window.localStorage.getItem('ctci-email-change-next')||0);const tick=()=>{const left=Math.max(0,Math.ceil((raw-Date.now())/1000));setEmailCooldown(left);if(left>0)timer=window.setTimeout(tick,1000)};tick();return()=>{if(timer)window.clearTimeout(timer)}},[])

  async function load(){const{data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/auth');return}const{data:profile}=await supabase.from('profiles').select('display_name,twitch_login,avatar_url').eq('id',user.id).maybeSingle();const currentEmail=user.email||'',hidden=internalEmail(currentEmail);setAccount({email:hidden?'':currentEmail,displayName:String(profile?.display_name||user.user_metadata?.display_name||''),twitchLogin:String(profile?.twitch_login||user.user_metadata?.twitch_login||''),avatarUrl:String(profile?.avatar_url||user.user_metadata?.avatar_url||''),internalEmail:hidden,emailConfirmed:!!user.email_confirmed_at&&!hidden,createdAt:user.created_at||'',lastSignIn:user.last_sign_in_at||''});setEmail(hidden?'':currentEmail);const q=new URLSearchParams(window.location.search);setStatus(q.get('email')==='confirmed'?'Email confirmation completed through Supabase Auth.':'Account ready')}

  function authMessage(message:string){const m=message.toLowerCase();if(m.includes('rate')||m.includes('too many'))return 'Supabase has temporarily rate-limited auth emails. Wait a minute before trying again. For production volume, configure custom SMTP in Supabase Auth.';return message}

  async function changeEmail(e:FormEvent){
    e.preventDefault();const next=email.trim().toLowerCase();if(!next){setStatus('Enter an email address');return}
    if(emailCooldown>0){setStatus(`Please wait ${emailCooldown}s before requesting another Supabase email.`);return}
    if(account?.emailConfirmed&&next===account.email.toLowerCase()){setStatus('That is already your verified login email.');return}
    setBusy(true);setStatus('Asking Supabase Auth to send the email-change verification…')
    const{error}=await supabase.auth.updateUser({email:next},{emailRedirectTo:`${window.location.origin}/dashboard/profile?email=confirmed`})
    setBusy(false)
    const until=Date.now()+EMAIL_COOLDOWN_MS;window.localStorage.setItem('ctci-email-change-next',String(until));setEmailCooldown(60)
    if(error){setStatus(authMessage(error.message));return}
    setStatus('Supabase sent the verification email. Open it and confirm the new address. CTCI does not send or store this email itself.')
  }

  async function changePassword(e:FormEvent){e.preventDefault();if(password.length<12){setStatus('Use at least 12 characters for the password.');return}if(password!==confirm){setStatus('Passwords do not match.');return}setBusy(true);setStatus('Updating password in Supabase Auth…');const{error}=await supabase.auth.updateUser({password});setBusy(false);if(error){setStatus(authMessage(error.message));return}setPassword('');setConfirm('');setStatus('Password updated in Supabase Auth. Email + password login is available after your real email is confirmed.')}
  async function signOut(){await supabase.auth.signOut();router.replace('/')}

  if(!account)return <><DashboardNav onSignOut={signOut}/><main className="app-main"><section className="panel">{status}</section></main></>
  return <><DashboardNav onSignOut={signOut}/><main className="app-main">
    <section className="dashboard-hero"><div><span className="eyebrow">ACCOUNT</span><h1>Profile & Supabase Auth</h1><p>Your real email, email verification, password and password recovery are handled by Supabase Auth. Twitch remains linked to the same streamer account.</p></div><div className="hero-status"><span className={`health-dot ${account.emailConfirmed?'online':''}`}/><div><strong>{account.emailConfirmed?'Manual login ready':account.internalEmail?'Twitch login only':'Email confirmation pending'}</strong><span>{status}</span></div></div></section>
    <div className="studio-layout"><section className="studio-content">
      <section className="panel"><div className="section-head"><div><span className="section-kicker">PROFILE</span><h2>Streamer identity</h2></div></div><div className="profile-identity">{account.avatarUrl?<img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="profile-avatar"/>:<div className="brand-mark profile-avatar-fallback">C</div>}<div><strong className="profile-display-name">{account.displayName||account.twitchLogin||'Streamer'}</strong><div className="small muted">{account.twitchLogin?`Twitch: ${account.twitchLogin}`:'Twitch not linked'}</div></div></div></section>
      <section className="panel"><div className="section-head"><div><span className="section-kicker">SUPABASE EMAIL</span><h2>Add or change login email</h2><p className="muted">CTCI calls Supabase Auth directly. Supabase sends the email-change confirmation and only updates your login address after verification.</p></div></div><form onSubmit={changeEmail}><div className="field"><label>Login email</label><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></div><div className="actions"><button className="btn primary" disabled={busy||emailCooldown>0}>{emailCooldown>0?`Wait ${emailCooldown}s`:'Send Supabase verification'}</button>{account.emailConfirmed&&<span className="status success">Verified: {account.email}</span>}</div><p className="small muted">If Supabase returns 429, its auth-email rate limit has been reached. The button has a local 60-second cooldown to avoid accidental repeated sends.</p></form></section>
      <section className="panel"><div className="section-head"><div><span className="section-kicker">SUPABASE PASSWORD</span><h2>Set or change password</h2><p className="muted">Passwords are stored and verified only by Supabase Auth. CTCI never receives an existing password hash and never writes passwords to app tables.</p></div></div><form onSubmit={changePassword}><div className="row"><div className="field"><label>New password</label><input type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/></div><div className="field"><label>Confirm password</label><input type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></div></div><button className="btn primary" disabled={busy}>Update in Supabase Auth</button></form></section>
    </section><aside className="studio-sidebar"><section className="panel"><span className="section-kicker">LOGIN METHODS</span><h3>Connected methods</h3><div className="command-list"><div className="command-card"><strong>✓ Twitch OAuth</strong><div className="small muted">Streamer identity/channel connection.</div></div><div className="command-card"><strong>{account.emailConfirmed?'✓':'○'} Supabase email + password</strong><div className="small muted">{account.emailConfirmed?account.email:'Add and verify a real email to enable it.'}</div></div></div></section><section className="panel"><h3>Email delivery</h3><p className="small muted">Verification and recovery emails are generated by Supabase Auth. For production-scale delivery, configure SMTP under Supabase Authentication → Emails → SMTP Settings.</p>{account.lastSignIn&&<p className="small muted">Last sign-in: {new Date(account.lastSignIn).toLocaleString()}</p>}</section></aside></div>
  </main></>
}
