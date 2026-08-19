import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { botGuildChannels } from '@/lib/discord'

export async function GET(){
  const sb=await createServerSupabase()
  const{data:{user}}=await sb.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const{data:connection,error}=await sb.from('discord_guild_connections').select('guild_id,guild_name').eq('owner_id',user.id).maybeSingle()
  if(error)return NextResponse.json({error:error.message},{status:500})
  if(!connection)return NextResponse.json({connected:false,channels:[]})
  try{
    const channels=await botGuildChannels(connection.guild_id)
    return NextResponse.json({connected:true,guild:connection,channels:channels.filter(c=>c.type===0||c.type===5).map(c=>({id:String(c.id),name:String(c.name),type:Number(c.type),position:Number(c.position||0),parent_id:c.parent_id?String(c.parent_id):null})).sort((a,b)=>a.position-b.position)})
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Failed to load Discord channels'},{status:502})}
}
