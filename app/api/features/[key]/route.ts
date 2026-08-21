import { NextRequest,NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { FEATURE_KEYS,isFeatureEnabled } from '@/lib/features'
import { featureAction,getFeatureSnapshot } from '@/lib/feature-runtime'

export const runtime='nodejs'
export const dynamic='force-dynamic'

async function owner(){const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();return user}
function keyOf(params:Promise<{key:string}>){return params.then(p=>String(p.key||''))}

export async function GET(_request:NextRequest,{params}:{params:Promise<{key:string}>}){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const key=await keyOf(params);if(!FEATURE_KEYS.has(key))return NextResponse.json({error:'Unknown feature'},{status:404})
  const admin=createAdminSupabase();if(!await isFeatureEnabled(admin,user.id,key))return NextResponse.json({error:'Feature is disabled',feature:key},{status:403})
  try{return NextResponse.json({feature:key,data:await getFeatureSnapshot(admin,user.id,key)})}catch(error:any){console.error('Feature snapshot failed',key,error);return NextResponse.json({error:error?.message||'Feature snapshot failed'},{status:500})}
}

export async function POST(request:NextRequest,{params}:{params:Promise<{key:string}>}){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const key=await keyOf(params);if(!FEATURE_KEYS.has(key))return NextResponse.json({error:'Unknown feature'},{status:404})
  const admin=createAdminSupabase();if(!await isFeatureEnabled(admin,user.id,key))return NextResponse.json({error:'Feature is disabled',feature:key},{status:403})
  try{const body=await request.json();return NextResponse.json({ok:true,result:await featureAction(admin,user.id,key,body)})}catch(error:any){console.error('Feature action failed',key,error);const message=String(error?.message||'Feature action failed');return NextResponse.json({error:message},{status:['unsupported_action','invalid_rule_type','invalid_command','response_required','invalid_poll','invalid_prediction','name_required','title_required','invalid_slug','invalid_status','no_entries'].includes(message)?400:500})}
}
