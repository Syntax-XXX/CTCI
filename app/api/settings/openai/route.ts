import { NextRequest,NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { hasStreamerOpenAIKey,validateOpenAIKey } from '@/lib/openai'

export const runtime='nodejs'

async function owner(){const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();return user}

export async function GET(){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{return NextResponse.json(await hasStreamerOpenAIKey(createAdminSupabase(),user.id))}
  catch(error){console.error('OpenAI key status failed',error);return NextResponse.json({error:'Failed to load OpenAI key status'},{status:500})}
}

export async function POST(request:NextRequest){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json() as {apiKey?:string}
    const apiKey=String(body.apiKey||'').trim()
    if(apiKey.length<8||apiKey.length>512)return NextResponse.json({error:'Enter a valid OpenAI API key.'},{status:400})
    await validateOpenAIKey(apiKey)
    const admin=createAdminSupabase()
    const{error}=await admin.rpc('save_streamer_openai_key',{p_owner_id:user.id,p_secret:apiKey,p_last4:apiKey.slice(-4)})
    if(error)throw error
    return NextResponse.json({ok:true,configured:true,last4:apiKey.slice(-4),validatedAt:new Date().toISOString()})
  }catch(error:any){
    console.error('OpenAI key save failed',error?.status||'',error?.message||error)
    if(error?.status===401)return NextResponse.json({error:'OpenAI rejected this API key. Check the key and try again.'},{status:400})
    if(error?.status===403)return NextResponse.json({error:'This OpenAI API key does not have permission to access the API.'},{status:400})
    if(error?.status===429)return NextResponse.json({error:'OpenAI accepted the request but the account is currently rate-limited or out of quota.'},{status:400})
    return NextResponse.json({error:'Could not validate or save this OpenAI API key.'},{status:500})
  }
}

export async function DELETE(){
  const user=await owner();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{const admin=createAdminSupabase();const{error}=await admin.rpc('delete_streamer_openai_key',{p_owner_id:user.id});if(error)throw error;return NextResponse.json({ok:true,configured:false})}
  catch(error){console.error('OpenAI key delete failed',error);return NextResponse.json({error:'Failed to remove OpenAI API key'},{status:500})}
}
