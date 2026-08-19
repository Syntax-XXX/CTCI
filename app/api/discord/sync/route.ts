import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { botGuild, botGuildChannels, botGuildRoles } from '@/lib/discord'

export const runtime='nodejs'

export async function POST(){
  const sb=await createServerSupabase()
  const{data:{user}}=await sb.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const admin=createAdminSupabase()
  const{data:connection,error}=await admin.from('discord_guild_connections').select('guild_id,guild_name').eq('owner_id',user.id).maybeSingle()
  if(error)return NextResponse.json({error:error.message},{status:500})
  if(!connection)return NextResponse.json({error:'Connect a Discord server first'},{status:409})
  try{
    const[guild,roles,channels]=await Promise.all([botGuild(connection.guild_id),botGuildRoles(connection.guild_id),botGuildChannels(connection.guild_id)])
    const{error:updateError}=await admin.from('discord_guild_connections').update({guild_name:String(guild.name||connection.guild_name),guild_icon:guild.icon||null,last_verified_at:new Date().toISOString()}).eq('owner_id',user.id)
    if(updateError)throw updateError
    return NextResponse.json({ok:true,guild:{id:String(guild.id),name:String(guild.name)},roles:roles.filter(r=>r.name!=='@everyone').length,channels:channels.filter(c=>c.type===0||c.type===5).length})
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Discord bot sync failed'},{status:502})}
}
