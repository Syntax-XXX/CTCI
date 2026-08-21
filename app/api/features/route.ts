import { NextRequest,NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { FEATURE_DEFINITIONS,FEATURE_KEYS,featureFlags } from '@/lib/features'

export const runtime='nodejs'

async function owner(){const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();return user}

export async function GET(){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const admin=createAdminSupabase()
  try{
    const[flags,tests]=await Promise.all([featureFlags(admin,user.id),admin.from('feature_test_results').select('feature_key,status,tested_at,test_kind,details')])
    if(tests.error)throw tests.error
    const byKey=new Map((tests.data||[]).map((row:any)=>[String(row.feature_key),row]))
    const features=FEATURE_DEFINITIONS.map(feature=>{
      const verification:any=byKey.get(feature.key)||null
      const stable=verification?.status==='pass'&&['e2e','user'].includes(String(verification?.test_kind||''))
      return{...feature,release:stable?'stable':'beta',verification:verification?{status:verification.status,testedAt:verification.tested_at,testKind:verification.test_kind,details:verification.details}:null}
    })
    return NextResponse.json({features,flags})
  }catch(error){console.error('Feature list failed',error);return NextResponse.json({error:'Failed to load feature settings'},{status:500})}
}

export async function PATCH(request:NextRequest){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json() as {key?:string;enabled?:boolean}
    const key=String(body.key||'')
    if(!FEATURE_KEYS.has(key))return NextResponse.json({error:'Unknown feature'},{status:400})
    if(typeof body.enabled!=='boolean')return NextResponse.json({error:'enabled must be boolean'},{status:400})
    const admin=createAdminSupabase(),current=await featureFlags(admin,user.id)
    current[key]=body.enabled
    const{error}=await admin.from('streamer_feature_flags').upsert({owner_id:user.id,flags:current,updated_at:new Date().toISOString()},{onConflict:'owner_id'})
    if(error)throw error
    const audit=await admin.from('audit_events').insert({owner_id:user.id,actor_user_id:user.id,action:'feature.toggle',target_type:'feature',target_id:key,metadata:{enabled:body.enabled}})
    if(audit.error)console.warn('Feature toggle audit failed',audit.error)
    return NextResponse.json({ok:true,key,enabled:body.enabled,flags:current})
  }catch(error){console.error('Feature update failed',error);return NextResponse.json({error:'Failed to update feature'},{status:500})}
}
