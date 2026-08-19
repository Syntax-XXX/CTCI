import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { inspectPluginZip } from '@/lib/plugins'

export const runtime='nodejs'

export async function POST(request:NextRequest){
  const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const form=await request.formData(),file=form.get('file')
  if(!(file instanceof File))return NextResponse.json({error:'Plugin ZIP is required'},{status:400})
  if(file.size>10*1024*1024)return NextResponse.json({error:'Plugin package exceeds 10 MB'},{status:413})
  try{
    const bytes=new Uint8Array(await file.arrayBuffer()),inspection=inspectPluginZip(bytes),m=inspection.manifest,admin=createAdminSupabase()
    const checksum=createHash('sha256').update(bytes).digest('hex'),path=`${user.id}/${m.id}/${m.version}-${checksum.slice(0,12)}.zip`
    const upload=await admin.storage.from('ctci-plugins').upload(path,bytes,{contentType:'application/zip',upsert:false});if(upload.error&&upload.error.message!=='The resource already exists')throw upload.error
    const existingPlugin=await admin.from('plugins').select('id').eq('id',m.id).maybeSingle()
    if(existingPlugin.error)throw existingPlugin.error
    if(existingPlugin.data)await admin.from('plugins').update({name:m.name,author:m.author,description:m.description||'',api_version:m.apiVersion,latest_version:m.version,updated_at:new Date().toISOString()}).eq('id',m.id)
    else{const r=await admin.from('plugins').insert({id:m.id,name:m.name,author:m.author,description:m.description||'',api_version:m.apiVersion,latest_version:m.version});if(r.error)throw r.error}
    const existingVersion=await admin.from('plugin_versions').select('id').eq('plugin_id',m.id).eq('version',m.version).maybeSingle();if(existingVersion.error)throw existingVersion.error
    if(existingVersion.data){const r=await admin.from('plugin_versions').update({manifest:m,bundle_path:path,checksum_sha256:checksum}).eq('id',existingVersion.data.id);if(r.error)throw r.error}else{const r=await admin.from('plugin_versions').insert({plugin_id:m.id,version:m.version,manifest:m,bundle_path:path,checksum_sha256:checksum});if(r.error)throw r.error}
    const existingInstall=await admin.from('plugin_installations').select('id').eq('owner_id',user.id).eq('plugin_id',m.id).maybeSingle();if(existingInstall.error)throw existingInstall.error
    let installationId:string
    if(existingInstall.data){installationId=existingInstall.data.id;const r=await admin.from('plugin_installations').update({version:m.version,enabled:false,source:'uploaded',updated_at:new Date().toISOString()}).eq('id',installationId);if(r.error)throw r.error}else{const r=await admin.from('plugin_installations').insert({owner_id:user.id,plugin_id:m.id,version:m.version,enabled:false,source:'uploaded'}).select('id').single();if(r.error)throw r.error;installationId=r.data.id}
    await admin.from('plugin_permission_grants').delete().eq('installation_id',installationId)
    if(m.permissions.length){const r=await admin.from('plugin_permission_grants').insert(m.permissions.map(permission=>({installation_id:installationId,permission,granted:true})));if(r.error)throw r.error}
    const config=await admin.from('plugin_configurations').select('installation_id').eq('installation_id',installationId).maybeSingle();if(!config.data)await admin.from('plugin_configurations').insert({installation_id:installationId,config:{}})
    return NextResponse.json({ok:true,installationId,manifest:m,enabled:false,checksum})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Plugin install failed'},{status:400})}
}
