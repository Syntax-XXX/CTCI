import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic='force-dynamic'

type Installation={id:string;plugin_id:string;version:string;enabled:boolean}
type DashboardPluginResult={installationId:string;pluginId:string;name:string;version:string;cards:any[]}
type OverlayPluginResult={pluginId:string;name:string;version:string;widgets:any[]}

export async function GET(request:NextRequest){
  const surface=request.nextUrl.searchParams.get('surface')
  if(surface!=='dashboard'&&surface!=='overlay')return NextResponse.json({error:'Invalid surface'},{status:400})
  const admin=createAdminSupabase()
  let ownerId:string
  let placement:string|undefined

  if(surface==='dashboard'){
    const sb=await createServerSupabase()
    const{data:{user}}=await sb.auth.getUser()
    if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
    ownerId=user.id
    placement=String(request.nextUrl.searchParams.get('placement')||'overview')
    if(!['overview','plugins','commands','badges'].includes(placement))return NextResponse.json({error:'Invalid placement'},{status:400})
  }else{
    const slug=String(request.nextUrl.searchParams.get('slug')||'').trim()
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(slug))return NextResponse.json({error:'Invalid overlay slug'},{status:400})
    const{data:overlay,error}=await admin.from('overlays').select('user_id').eq('slug',slug).eq('enabled',true).maybeSingle()
    if(error)throw error
    if(!overlay)return NextResponse.json({plugins:[]},{headers:{'Cache-Control':'public, max-age=15, stale-while-revalidate=30'}})
    ownerId=overlay.user_id
  }

  try{
    const{data:installs,error:installError}=await admin.from('plugin_installations').select('id,plugin_id,version,enabled').eq('owner_id',ownerId).eq('enabled',true)
    if(installError)throw installError
    const active=(installs||[]) as Installation[]
    if(!active.length)return NextResponse.json({plugins:[]},{headers:{'Cache-Control':surface==='overlay'?'public, max-age=15, stale-while-revalidate=30':'private, no-store'}})

    const ids=[...new Set(active.map(i=>i.plugin_id))]
    const{data:versions,error:versionError}=await admin.from('plugin_versions').select('plugin_id,version,manifest').in('plugin_id',ids)
    if(versionError)throw versionError
    const versionMap=new Map<string,any>((versions||[]).map((row:any)=>[`${row.plugin_id}@${row.version}`,row.manifest]))

    if(surface==='dashboard'){
      const plugins:DashboardPluginResult[]=[]
      for(const installation of active){
        const manifest:any=versionMap.get(`${installation.plugin_id}@${installation.version}`)
        if(!manifest?.permissions?.includes('ui.render')||!manifest.ui)continue
        const cards=Array.isArray(manifest.ui.dashboard)?manifest.ui.dashboard.filter((card:any)=>(card.placement||'overview')===placement):[]
        if(!cards.length)continue
        plugins.push({installationId:installation.id,pluginId:installation.plugin_id,name:String(manifest.name||installation.plugin_id),version:installation.version,cards})
      }
      return NextResponse.json({plugins},{headers:{'Cache-Control':'private, no-store'}})
    }

    const plugins:OverlayPluginResult[]=[]
    for(const installation of active){
      const manifest:any=versionMap.get(`${installation.plugin_id}@${installation.version}`)
      if(!manifest?.permissions?.includes('ui.render')||!manifest.ui)continue
      const widgets=Array.isArray(manifest.ui.overlay)?manifest.ui.overlay:[]
      if(!widgets.length)continue
      plugins.push({pluginId:installation.plugin_id,name:String(manifest.name||installation.plugin_id),version:installation.version,widgets})
    }
    return NextResponse.json({plugins},{headers:{'Cache-Control':'public, max-age=15, stale-while-revalidate=30'}})
  }catch(error){
    console.error('Plugin UI load failed',error)
    return NextResponse.json({error:'Failed to load plugin UI'},{status:500})
  }
}
