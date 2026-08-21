import { notFound } from 'next/navigation'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/features'

export const dynamic='force-dynamic'

export default async function PublicStreamerPage({params}:{params:Promise<{slug:string}>}){
  const slug=String((await params).slug||'')
  const admin=createAdminSupabase()
  const page=await admin.from('public_streamer_pages').select('owner_id,slug,enabled,config,updated_at').eq('slug',slug).eq('enabled',true).maybeSingle()
  if(page.error||!page.data||!await isFeatureEnabled(admin,page.data.owner_id,'public_streamer_page'))notFound()
  const[profile,overlay,poll]=await Promise.all([
    admin.from('profiles').select('display_name,avatar_url,twitch_login').eq('id',page.data.owner_id).single(),
    admin.from('overlays').select('slug,show_twitch_chat,show_youtube_chat,youtube_active_title,youtube_last_sync_at').eq('user_id',page.data.owner_id).single(),
    admin.from('chat_polls').select('id,question,options').eq('owner_id',page.data.owner_id).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ])
  if(profile.error||overlay.error)notFound()
  const cfg=page.data.config&&typeof page.data.config==='object'?page.data.config:{} as any
  let counts:number[]=[]
  if(poll.data){const votes=await admin.from('chat_poll_votes').select('option_index').eq('poll_id',poll.data.id);const options=Array.isArray(poll.data.options)?poll.data.options:[];counts=options.map(()=>0);for(const v of votes.data||[]){const i=Number(v.option_index);if(i>=0&&i<counts.length)counts[i]++}}
  const live=!!overlay.data.youtube_active_title||(overlay.data.youtube_last_sync_at&&Date.now()-Date.parse(overlay.data.youtube_last_sync_at)<120000)
  return <main style={{maxWidth:920,margin:'0 auto',padding:'48px 20px 80px'}}>
    <section className="panel"><div style={{display:'flex',gap:18,alignItems:'center'}}>{profile.data.avatar_url&&<img src={profile.data.avatar_url} alt="" width={84} height={84} style={{borderRadius:'50%',objectFit:'cover'}}/>}<div><span className="eyebrow">CTCI STREAMER</span><h1 style={{marginBottom:4}}>{String(cfg.title||profile.data.display_name||profile.data.twitch_login||'Streamer')}</h1><p className="muted" style={{margin:0}}>{String(cfg.bio||'Live chat powered by CTCI.')}</p></div></div><div className="actions" style={{marginTop:20}}><span className={`chip ${live?'done':''}`}>{live?'● Live':'○ Offline / waiting'}</span>{overlay.data.show_twitch_chat&&<span className="chip">Twitch</span>}{overlay.data.show_youtube_chat&&<span className="chip">YouTube</span>}</div>{overlay.data.youtube_active_title&&<p style={{marginTop:18}}><strong>{overlay.data.youtube_active_title}</strong></p>}</section>
    {poll.data&&<section className="panel" style={{marginTop:18}}><span className="section-kicker">LIVE POLL</span><h2>{poll.data.question}</h2>{(poll.data.options||[]).map((option:any,index:number)=>{const total=counts.reduce((a,b)=>a+b,0),pct=total?Math.round((counts[index]||0)/total*100):0;return <div key={index} style={{marginTop:10}}><div style={{display:'flex',justifyContent:'space-between'}}><span>{index+1}. {String(option)}</span><span>{pct}%</span></div><progress value={counts[index]||0} max={Math.max(1,total)} style={{width:'100%'}}/></div>})}</section>}
    {Array.isArray(cfg.links)&&cfg.links.length>0&&<section className="panel" style={{marginTop:18}}><h2>Links</h2><div className="actions">{cfg.links.slice(0,10).map((link:any,index:number)=>/^https:\/\//.test(String(link?.url||''))?<a key={index} className="btn" href={String(link.url)} target="_blank" rel="noopener noreferrer">{String(link.label||'Open')}</a>:null)}</div></section>}
  </main>
}
