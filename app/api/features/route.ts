import { NextRequest,NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { FEATURE_DEFINITIONS,FEATURE_KEYS,featureFlags } from '@/lib/features'

export const runtime='nodejs'

async function owner(){const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();return user}

export async function GET(){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const admin=createAdminSupabase()
  try{return NextResponse.json({features:FEATURE_DEFINITIONS,flags:await featureFlags(admin,user.id)})}
  catch(error){console.error('Feature list failed',error);return NextResponse.json({error:'Failed to load feature settings'},{status:500})}
}

export async function PATCH(request:NextRequest){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json() as {key?:string;enabled?:boolean}
    const key=String(body.key||'')
    if(!FEATURE_KEYS.has(key))return NextResponse.json({error:'Unknown feature'},{status:400})
    if(typeof body.enabled!=='boolean')return NextResponse.json({error:'enabled must be boolean'},{status:400})
    const admin=createAdminSupabase()
    const current=await featureFlags(admin,user.id)
    current[key]=body.enabled
    const{error}=await admin.from('streamer_feature_flags').upsert({owner_id:user.id,flags:current,updated_at:new Date().toISOString()},{onConflict:'owner_id'})
    if(error)throw error
    return NextResponse.json({ok:true,key,enabled:body.enabled,flags:current})
  }catch(error){console.error('Feature update failed',error);return NextResponse.json({error:'Failed to update feature'},{status:500})}
}
