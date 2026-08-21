import type { SupabaseClient } from '@supabase/supabase-js'

export async function getStreamerOpenAIKey(admin:SupabaseClient,ownerId:string){
  const{data,error}=await admin.rpc('get_streamer_openai_key',{p_owner_id:ownerId})
  if(error)throw error
  return typeof data==='string'&&data.trim()?data.trim():null
}

export async function hasStreamerOpenAIKey(admin:SupabaseClient,ownerId:string){
  const{data,error}=await admin.from('streamer_api_credentials').select('secret_last4,validated_at').eq('owner_id',ownerId).eq('provider','openai').maybeSingle()
  if(error)throw error
  return{configured:!!data,last4:data?.secret_last4||null,validatedAt:data?.validated_at||null}
}

export async function validateOpenAIKey(apiKey:string){
  const key=apiKey.trim()
  if(key.length<8)throw new Error('Invalid OpenAI API key')
  const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},cache:'no-store'})
  if(response.ok)return true
  const body=await response.json().catch(()=>({}))
  const message=typeof body?.error?.message==='string'?body.error.message:'OpenAI rejected this API key'
  const error:any=new Error(message)
  error.status=response.status
  throw error
}
