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

export async function callStreamerOpenAI(admin:SupabaseClient,ownerId:string,input:string,options?:{model?:string;maxOutputTokens?:number}){
  const apiKey=await getStreamerOpenAIKey(admin,ownerId)
  if(!apiKey)throw new Error('OpenAI API key is not configured for this streamer')
  const model=String(options?.model||'gpt-5.6-luna').slice(0,80)
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({model,input:input.slice(0,50000),max_output_tokens:Math.max(64,Math.min(4000,Number(options?.maxOutputTokens||1200)))})
  })
  const body=await response.json().catch(()=>({}))
  if(!response.ok){const error:any=new Error(body?.error?.message||`OpenAI API ${response.status}`);error.status=response.status;throw error}
  const text=extractResponseText(body)
  if(!text)throw new Error('OpenAI returned no text output')
  return{text,model:body?.model||model,responseId:body?.id||null,usage:body?.usage||null}
}

function extractResponseText(body:any){
  if(typeof body?.output_text==='string'&&body.output_text.trim())return body.output_text.trim()
  const chunks:string[]=[]
  for(const item of Array.isArray(body?.output)?body.output:[]){for(const content of Array.isArray(item?.content)?item.content:[]){if(content?.type==='output_text'&&typeof content?.text==='string')chunks.push(content.text)}}
  return chunks.join('\n').trim()
}
