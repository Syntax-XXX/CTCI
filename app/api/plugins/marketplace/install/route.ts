import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export async function POST(request:NextRequest){
  const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json() as {pluginId?:string;version?:string}
    const pluginId=String(body.pluginId||'').trim()
    if(!pluginId)return NextResponse.json({error:'pluginId is required'},{status:400})
    const admin=createAdminSupabase()
    const{data:plugin,error:pe}=await admin.from('plugins').select('*').eq('id',pluginId).eq('marketplace_status','published').maybeSingle()
    if(pe)throw pe;if(!plugin)return NextResponse.json({error:'Marketplace plugin not found'},{status:404})

    const requestedVersion=String(body.version||plugin.latest_version||'').trim()
    if(!requestedVersion||requestedVersion!==String(plugin.latest_version||''))return NextResponse.json({error:'Only the current approved Marketplace version can be installed'},{status:409})

    const{data:pv,error:ve}=await admin.from('plugin_versions').select('manifest,version,bundle_path,checksum_sha256,marketplace_published').eq('plugin_id',pluginId).eq('version',requestedVersion).eq('marketplace_published',true).maybeSingle()
    if(ve)throw ve;if(!pv)return NextResponse.json({error:'Approved Marketplace plugin version not found'},{status:404})
    if(!pv.bundle_path||!pv.checksum_sha256)return NextResponse.json({error:'Marketplace package is incomplete'},{status:409})

    const manifest=pv.manifest as any
    const existing=await admin.from('plugin_installations').select('id,source,version').eq('owner_id',user.id).eq('plugin_id',pluginId).maybeSingle();if(existing.error)throw existing.error
    let installationId:string
    const isNew=!existing.data
    if(existing.data){installationId=existing.data.id;const r=await admin.from('plugin_installations').update({version:requestedVersion,enabled:false,source:'marketplace',updated_at:new Date().toISOString()}).eq('id',installationId).eq('owner_id',user.id);if(r.error)throw r.error}
    else{const r=await admin.from('plugin_installations').insert({owner_id:user.id,plugin_id:pluginId,version:requestedVersion,enabled:false,source:'marketplace'}).select('id').single();if(r.error)throw r.error;installationId=r.data.id}
    await admin.from('plugin_permission_grants').delete().eq('installation_id',installationId)
    const permissions=Array.isArray(manifest?.permissions)?manifest.permissions:[]
    if(permissions.length){const g=await admin.from('plugin_permission_grants').insert(permissions.map((permission:string)=>({installation_id:installationId,permission,granted:true})));if(g.error)throw g.error}
    const cfg=await admin.from('plugin_configurations').select('installation_id').eq('installation_id',installationId).maybeSingle();if(!cfg.data){const c=await admin.from('plugin_configurations').insert({installation_id:installationId,config:{}});if(c.error)throw c.error}
    if(isNew)await admin.rpc('increment_plugin_install_count',{p_plugin_id:pluginId})
    return NextResponse.json({ok:true,installationId,pluginId,version:requestedVersion,enabled:false,manifest})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Marketplace install failed'},{status:400})}
}
