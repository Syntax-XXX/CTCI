import { NextRequest,NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { featureFlags } from '@/lib/features'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const slug=String(request.nextUrl.searchParams.get('slug')||'').trim()
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(slug))return NextResponse.json({error:'Invalid overlay slug'},{status:400})
  const admin=createAdminSupabase()
  try{
    const resolved=await resolveOverlay(admin,slug);if(!resolved)return NextResponse.json({error:'Overlay not found'},{status:404})
    const {ownerId,overlayId}=resolved,flags=await featureFlags(admin,ownerId),payload:any={flags:{}}
    for(const key of['featured_messages','qna','cross_platform_polls','predictions','paid_events','tts','overlay_layers'])payload.flags[key]=flags[key]===true

    if(flags.featured_messages){const f=await admin.from('featured_messages').select('chat_event_id,featured_at,expires_at').eq('owner_id',ownerId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('featured_at',{ascending:false}).limit(1).maybeSingle();if(f.error)throw f.error;if(f.data){const m=await admin.from('chat_events').select('id,source,chatter_name,message_text,event_type,event_data,created_at').eq('overlay_id',overlayId).eq('id',f.data.chat_event_id).maybeSingle();if(m.error)throw m.error;payload.featured=m.data?{...m.data,expires_at:f.data.expires_at}:null}}
    if(flags.qna){const q=await admin.from('qna_items').select('id,source,display_name,question,status,created_at').eq('owner_id',ownerId).eq('status','featured').order('created_at',{ascending:false}).limit(1).maybeSingle();if(q.error)throw q.error;payload.qna=q.data||null}
    if(flags.cross_platform_polls){const p=await admin.from('chat_polls').select('id,question,options,created_at').eq('owner_id',ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle();if(p.error)throw p.error;if(p.data){const votes=await admin.from('chat_poll_votes').select('option_index').eq('poll_id',p.data.id);if(votes.error)throw votes.error;const options=Array.isArray(p.data.options)?p.data.options:[],counts=options.map(()=>0);for(const v of votes.data||[]){const i=Number(v.option_index);if(i>=0&&i<counts.length)counts[i]++}payload.poll={...p.data,counts,total:counts.reduce((a,b)=>a+b,0)}}}
    if(flags.predictions){const p=await admin.from('predictions').select('id,question,options,created_at').eq('owner_id',ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle();if(p.error)throw p.error;if(p.data){const entries=await admin.from('prediction_entries').select('option_index,amount').eq('prediction_id',p.data.id);if(entries.error)throw entries.error;const options=Array.isArray(p.data.options)?p.data.options:[],counts=options.map(()=>0),amounts=options.map(()=>0);for(const e of entries.data||[]){const i=Number(e.option_index);if(i>=0&&i<counts.length){counts[i]++;amounts[i]+=Number(e.amount||0)}}payload.prediction={...p.data,counts,amounts}}}
    if(flags.paid_events){const e=await admin.from('chat_events').select('id,source,event_type,chatter_name,message_text,event_data,created_at').eq('overlay_id',overlayId).neq('event_type','message').order('created_at',{ascending:false}).limit(1).maybeSingle();if(e.error)throw e.error;payload.paidEvent=e.data||null}
    if(flags.tts){const cfg=await admin.from('streamer_feature_configs').select('config').eq('owner_id',ownerId).eq('feature_key','tts').maybeSingle();if(cfg.error)throw cfg.error;const last=await admin.from('chat_events').select('id,source,chatter_name,message_text,badges,created_at').eq('overlay_id',overlayId).eq('event_type','message').order('created_at',{ascending:false}).limit(1).maybeSingle();if(last.error)throw last.error;payload.tts={config:sanitizeTtsConfig(cfg.data?.config||{}),message:last.data||null}}
    return NextResponse.json(payload,{headers:{'Cache-Control':'no-store, max-age=0'}})
  }catch(error){console.error('Overlay feature state failed',error);return NextResponse.json({error:'Failed to load overlay feature state'},{status:500})}
}

async function resolveOverlay(admin:any,slug:string){const p=await admin.from('overlays').select('id,user_id,enabled').eq('slug',slug).maybeSingle();if(p.error)throw p.error;if(p.data?.enabled)return{ownerId:p.data.user_id,overlayId:p.data.id};const i=await admin.from('overlay_instances').select('owner_id,enabled').eq('slug',slug).maybeSingle();if(i.error)throw i.error;if(!i.data?.enabled)return null;const b=await admin.from('overlays').select('id,enabled').eq('user_id',i.data.owner_id).single();if(b.error||!b.data?.enabled)return null;return{ownerId:i.data.owner_id,overlayId:b.data.id}}
function sanitizeTtsConfig(c:any){return{enabled:c.enabled!==false,rate:clamp(Number(c.rate||1),0.5,2),pitch:clamp(Number(c.pitch||1),0,2),volume:clamp(Number(c.volume||1),0,1),includeName:c.includeName===true,maxLength:Math.max(20,Math.min(500,Number(c.maxLength||220))),roles:Array.isArray(c.roles)?c.roles.slice(0,10):['broadcaster','moderator','vip','subscriber','viewer']}}
function clamp(v:number,min:number,max:number){return Math.min(max,Math.max(min,Number.isFinite(v)?v:min))}
