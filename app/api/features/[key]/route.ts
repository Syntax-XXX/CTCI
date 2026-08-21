import { NextRequest,NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { FEATURE_KEYS,isFeatureEnabled } from '@/lib/features'
import { featureAction,getFeatureSnapshot } from '@/lib/feature-runtime'
import { sendAnnouncement } from '@/lib/announcements'

export const runtime='nodejs'
export const dynamic='force-dynamic'

async function owner(){const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();return user}
function keyOf(params:Promise<{key:string}>){return params.then(p=>String(p.key||''))}

export async function GET(_request:NextRequest,{params}:{params:Promise<{key:string}>}){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const key=await keyOf(params);if(!FEATURE_KEYS.has(key))return NextResponse.json({error:'Unknown feature'},{status:404})
  const admin=createAdminSupabase();if(!await isFeatureEnabled(admin,user.id,key))return NextResponse.json({error:'Feature is disabled',feature:key},{status:403})
  try{
    if(key==='viewer_identity')return NextResponse.json({feature:key,data:await scopedViewerIdentities(admin,user.id)})
    return NextResponse.json({feature:key,data:await getFeatureSnapshot(admin,user.id,key)})
  }catch(error:any){console.error('Feature snapshot failed',key,error);return NextResponse.json({error:error?.message||'Feature snapshot failed'},{status:500})}
}

export async function POST(request:NextRequest,{params}:{params:Promise<{key:string}>}){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const key=await keyOf(params);if(!FEATURE_KEYS.has(key))return NextResponse.json({error:'Unknown feature'},{status:404})
  const admin=createAdminSupabase();if(!await isFeatureEnabled(admin,user.id,key))return NextResponse.json({error:'Feature is disabled',feature:key},{status:403})
  try{
    const body=await request.json()
    if(key==='chat_announcements'&&String(body?.action||'')==='send')return NextResponse.json({ok:true,result:await sendAnnouncement(admin,user.id,String(body?.message||''))})
    return NextResponse.json({ok:true,result:await featureAction(admin,user.id,key,body)})
  }catch(error:any){console.error('Feature action failed',key,error);const message=String(error?.message||'Feature action failed');return NextResponse.json({error:message},{status:['unsupported_action','invalid_rule_type','invalid_command','response_required','invalid_poll','invalid_prediction','name_required','title_required','invalid_slug','invalid_status','no_entries','message_required'].includes(message)?400:500})}
}

async function scopedViewerIdentities(admin:any,ownerId:string){
  const accountRows=await admin.from('loyalty_accounts').select('viewer_id').eq('owner_id',ownerId).limit(500)
  if(accountRows.error)throw accountRows.error
  const viewerIds=new Set<string>((accountRows.data||[]).map((row:any)=>String(row.viewer_id)))
  const overlay=await admin.from('overlays').select('id').eq('user_id',ownerId).single();if(overlay.error)throw overlay.error
  const recent=await admin.from('chat_events').select('source,chatter_user_id').eq('overlay_id',overlay.data.id).order('created_at',{ascending:false}).limit(500);if(recent.error)throw recent.error
  const pairs=new Set<string>((recent.data||[]).map((row:any)=>`${row.source}:${row.chatter_user_id}`))
  let identities:any[]=[]
  if(viewerIds.size){const r=await admin.from('viewer_identities').select('id,viewer_id,platform,platform_user_id,platform_login,verified_at').in('viewer_id',[...viewerIds]).order('verified_at',{ascending:false}).limit(500);if(r.error)throw r.error;identities=r.data||[]}
  if(pairs.size){
    const platforms=[...new Set((recent.data||[]).map((row:any)=>String(row.source)).filter((v:string)=>['twitch','youtube','discord'].includes(v)))]
    for(const platform of platforms){const ids=[...new Set((recent.data||[]).filter((row:any)=>row.source===platform).map((row:any)=>String(row.chatter_user_id)))].slice(0,300);if(!ids.length)continue;const r=await admin.from('viewer_identities').select('id,viewer_id,platform,platform_user_id,platform_login,verified_at').eq('platform',platform).in('platform_user_id',ids);if(r.error)throw r.error;identities.push(...(r.data||[]))}
  }
  const unique=[...new Map(identities.map(row=>[row.id,row])).values()]
  const config=await admin.from('streamer_feature_configs').select('config').eq('owner_id',ownerId).eq('feature_key','viewer_identity').maybeSingle();if(config.error)throw config.error
  return{config:config.data?.config||{},identities:unique.slice(0,500)}
}
