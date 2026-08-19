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
    const{data,error}=await owned.admin.from('plugin_configurations').select('config').eq('installation_id',installationId).maybeSingle()
    if(error)throw error
    return NextResponse.json({config:data?.config||{}})
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
    if(!permissions.includes('config.write'))return NextResponse.json({error:'Plugin does not have config.write permission'},{status:403})
    const fields=(Array.isArray(owned.manifest?.ui?.dashboard)?owned.manifest.ui.dashboard:[]).flatMap((card:any)=>Array.isArray(card.settings)?card.settings:[])
    const field=fields.find((candidate:any)=>candidate?.key===key)
    if(!field)return NextResponse.json({error:'Setting is not declared by this plugin'},{status:400})
    const value=validateValue(field,body.value)
    const{data:row,error:readError}=await owned.admin.from('plugin_configurations').select('config').eq('installation_id',installationId).maybeSingle()
    if(readError)throw readError
    const config={...(row?.config||{}),[key]:value}
    const{error}=await owned.admin.from('plugin_configurations').upsert({installation_id:installationId,config},{onConflict:'installation_id'})
    if(error)throw error
    return NextResponse.json({ok:true,key,value,config})
  }catch(error){console.error('Plugin config update failed',error);return NextResponse.json({error:error instanceof Error?error.message:'Failed to update plugin configuration'},{status:400})}
}

function validateValue(field:any,value:unknown){
  switch(field.type){
    case'text':{const v=String(value??'');if(v.length>1000)throw new Error('Text setting is too long');return v}
    case'number':{const v=Number(value);if(!Number.isFinite(v))throw new Error('Invalid number setting');if(field.min!==undefined&&v<field.min)throw new Error('Number is below minimum');if(field.max!==undefined&&v>field.max)throw new Error('Number is above maximum');return v}
    case'boolean':return Boolean(value)
    case'color':{const v=String(value||'');if(!/^#[0-9a-fA-F]{6}$/.test(v))throw new Error('Invalid color setting');return v}
    case'select':{const v=String(value??'');const options=Array.isArray(field.options)?field.options:[];if(!options.some((o:any)=>o?.value===v))throw new Error('Invalid select option');return v}
    default:throw new Error('Unsupported setting type')
  }
}
