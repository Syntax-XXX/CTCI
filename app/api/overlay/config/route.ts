import { NextRequest,NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/features'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const slug=String(request.nextUrl.searchParams.get('slug')||'').trim()
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(slug))return NextResponse.json({error:'Invalid overlay slug'},{status:400})
  const admin=createAdminSupabase()
  const primary=await admin.from('overlays').select('*').eq('slug',slug).eq('enabled',true).maybeSingle()
  if(primary.error)return NextResponse.json({error:'Overlay lookup failed'},{status:500})
  if(primary.data)return NextResponse.json({overlay:{...primary.data,primary_overlay_id:primary.data.id,instance_id:null},instance:false},{headers:{'Cache-Control':'no-store'}})
  const instance=await admin.from('overlay_instances').select('*').eq('slug',slug).eq('enabled',true).maybeSingle()
  if(instance.error)return NextResponse.json({error:'Overlay lookup failed'},{status:500})
  if(!instance.data)return NextResponse.json({error:'Overlay not found or disabled'},{status:404})
  if(!await isFeatureEnabled(admin,instance.data.owner_id,'multi_overlays'))return NextResponse.json({error:'Overlay not found or disabled'},{status:404})
  const base=await admin.from('overlays').select('*').eq('user_id',instance.data.owner_id).eq('enabled',true).single()
  if(base.error)return NextResponse.json({error:'Base overlay unavailable'},{status:404})
  const settings=instance.data.settings&&typeof instance.data.settings==='object'?instance.data.settings:{}
  return NextResponse.json({overlay:{...base.data,...settings,id:base.data.id,primary_overlay_id:base.data.id,slug:instance.data.slug,instance_id:instance.data.id,instance_name:instance.data.name},instance:true},{headers:{'Cache-Control':'no-store'}})
}
