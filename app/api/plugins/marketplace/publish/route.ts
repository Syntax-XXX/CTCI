import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { inspectPluginZip } from '@/lib/plugins'

export const runtime='nodejs'

async function requireAdmin(){
  const sb=await createServerSupabase()
  const{data:{user}}=await sb.auth.getUser()
  if(!user)return null
  const admin=createAdminSupabase()
  const{data}=await admin.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle()
  return data?{user,admin}:null
}

export async function POST(request:NextRequest){
  const auth=await requireAdmin()
  if(!auth)return NextResponse.json({error:'Platform admin required'},{status:403})
  try{
    const form=await request.formData(),file=form.get('file')
    if(!(file instanceof File))return NextResponse.json({error:'Plugin ZIP is required'},{status:400})
    if(file.size>10*1024*1024)return NextResponse.json({error:'Plugin package exceeds 10 MB'},{status:413})
    const bytes=new Uint8Array(await file.arrayBuffer()),inspection=inspectPluginZip(bytes),m=inspection.manifest
    const checksum=createHash('sha256').update(bytes).digest('hex')
    const path=`marketplace/${m.id}/${m.version}-${checksum.slice(0,12)}.zip`
    const upload=await auth.admin.storage.from('ctci-plugins').upload(path,bytes,{contentType:'application/zip',upsert:false})
    if(upload.error&&!upload.error.message.toLowerCase().includes('already exists'))throw upload.error
    const category=String(form.get('category')||'other').trim().toLowerCase().slice(0,40)||'other'
    const tags=String(form.get('tags')||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean).slice(0,12)
    const featured=String(form.get('featured')||'false')==='true'
    const now=new Date().toISOString()
    const plugin=await auth.admin.from('plugins').upsert({id:m.id,name:m.name,author:m.author,description:m.description||'',api_version:m.apiVersion,latest_version:m.version,marketplace_status:'published',category,tags,featured,verified:true,published_at:now,updated_at:now},{onConflict:'id'}).select('*').single()
    if(plugin.error)throw plugin.error
    const version=await auth.admin.from('plugin_versions').upsert({plugin_id:m.id,version:m.version,manifest:m,bundle_path:path,checksum_sha256:checksum},{onConflict:'plugin_id,version'}).select('id').single()
    if(version.error)throw version.error
    return NextResponse.json({ok:true,plugin:plugin.data,manifest:m,checksum,fileCount:inspection.fileCount,uncompressedBytes:inspection.uncompressedBytes})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Marketplace publish failed'},{status:400})}
}
