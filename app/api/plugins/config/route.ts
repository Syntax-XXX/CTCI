import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

async function getOwnedInstallation(installationId:string){
  const sb=await createServerSupabase()
  const{data:{user}}=await sb.auth.getUser()
  if(!user)return{error:NextResponse.json({error:'Unauthorized'},{status:401})}
  const admin=createAdminSupabase()
  const{data:installation,error}=await admin.from('plugin_installations').select('id,owner_id,plugin_id,version,enabled').eq('id',installationId).eq('owner_id',user.id).maybeSingle()
  if(error)throw error
  if(!installation)return{error:NextResponse.json({error:'Plugin installation not found'},{status:404})}
  const{data:version,error:versionError}=await admin.from('plugin_versions').select('manifest').eq('plugin_id',installation.plugin_id).eq('version',installation.version).maybeSingle()
  if(versionError)throw versionError
  if(!version)return{error:NextResponse.json({error:'Plugin version not found'},{status:404})}
  return{admin,installation,manifest:version.manifest as any}
}

export async function GET(request:NextRequest){
  const installationId=String(request.nextUrl.searchParams.get('installationId')||'')
  if(!installationId)return NextResponse.json({error:'installationId is required'},{status:400})
  try{
    const owned=await getOwnedInstallation(installationId)
    if('error'in owned)return owned.error
    const permissions=Array.isArray(owned.manifest?.permissions)?owned.manifest.permissions:[]
    if(!permissions.includes('config.read'))return NextResponse.json({error:'Plugin does not have config.read permission'},{status:403})
    const{data,error}=await owned.admin.from('plugin_configurations').select('config').eq('installation_id',installationId).maybeSingle()
    if(error)throw error
    return NextResponse.json({config:data?.config||{}},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){console.error('Plugin config read failed',error);return NextResponse.json({error:'Failed to read plugin configuration'},{status:500})}
}

export async function PATCH(request:NextRequest){
  try{
    const body=await request.json() as {installationId?:string;key?:string;value?:unknown}
    const installationId=String(body.installationId||''),key=String(body.key||'')
    if(!installationId||!/^[a-zA-Z0-9_.-]{1,64}$/.test(key))return NextResponse.json({error:'Invalid plugin setting request'},{status:400})
    const owned=await getOwnedInstallation(installationId)
    if('error'in owned)return owned.error
    const permissions=Array.isArray(owned.manifest?.permissions)?owned.manifest.permissions:[]
    if(!permissions.includes('config.read')||!permissions.includes('config.write'))return NextResponse.json({error:'Plugin settings require config.read and config.write permissions'},{status:403})
    const fields=(Array.isArray(owned.manifest?.ui?.dashboard)?owned.manifest.ui.dashboard:[]).flatMap((card:any)=>Array.isArray(card.settings)?card.settings:[])
    const field=fields.find((candidate:any)=>candidate?.key===key)
    if(!field)return NextResponse.json({error:'Setting is not declared by this plugin'},{status:400})
    const value=validateValue(field,body.value)
    const{data:row,error:readError}=await owned.admin.from('plugin_configurations').select('config').eq('installation_id',installationId).maybeSingle()
    if(readError)throw readError
    const current=row?.config&&typeof row.config==='object'&&!Array.isArray(row.config)?row.config:{}
    const config={...current,[key]:value}
    if(JSON.stringify(config).length>64*1024)return NextResponse.json({error:'Plugin configuration exceeds 64 KB'},{status:413})
    const{error}=await owned.admin.from('plugin_configurations').upsert({installation_id:installationId,config},{onConflict:'installation_id'})
    if(error)throw error
    return NextResponse.json({ok:true,key,value,config},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){console.error('Plugin config update failed',error);return NextResponse.json({error:error instanceof Error?error.message:'Failed to update plugin configuration'},{status:400})}
}

function validateValue(field:any,value:unknown){
  switch(field.type){
    case'text':{if(typeof value!=='string')throw new Error('Invalid text setting');if(value.length>1000)throw new Error('Text setting is too long');return value}
    case'number':{if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Invalid number setting');if(field.min!==undefined&&value<field.min)throw new Error('Number is below minimum');if(field.max!==undefined&&value>field.max)throw new Error('Number is above maximum');return value}
    case'boolean':{if(typeof value!=='boolean')throw new Error('Invalid boolean setting');return value}
    case'color':{if(typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))throw new Error('Invalid color setting');return value}
    case'select':{if(typeof value!=='string')throw new Error('Invalid select option');const options=Array.isArray(field.options)?field.options:[];if(!options.some((o:any)=>o?.value===value))throw new Error('Invalid select option');return value}
    default:throw new Error('Unsupported setting type')
  }
}
