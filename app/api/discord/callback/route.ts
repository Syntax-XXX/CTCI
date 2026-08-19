import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { APP_URL, botGuild, discordMe, discordUserGuilds, exchangeDiscordCode } from '@/lib/discord'

const ADMINISTRATOR = 1n << 3n
const MANAGE_GUILD = 1n << 5n

export async function GET(req:NextRequest){
  const state=req.nextUrl.searchParams.get('state')
  const expected=req.cookies.get('ctci_discord_state')?.value
  const code=req.nextUrl.searchParams.get('code')
  if(!state||!expected||state!==expected||!code)return NextResponse.json({error:'Invalid Discord OAuth state'},{status:400})

  try{
    const sb=await createServerSupabase()
    const{data:{user}}=await sb.auth.getUser()
    if(!user)return clearState(NextResponse.redirect(new URL('/auth',APP_URL)))

    const token=await exchangeDiscordCode(code)
    const discordUser=await discordMe(token.access_token)
    const guildId=String(token.guild?.id||req.nextUrl.searchParams.get('guild_id')||'')
    if(!/^\d{5,30}$/.test(guildId))throw new Error('Discord did not return a valid selected server')

    const userGuilds=await discordUserGuilds(token.access_token)
    const selected=userGuilds.find(g=>String(g.id)===guildId)
    if(!selected)throw new Error('Selected Discord server is not available to this Discord account')
    let permissions=0n
    try{permissions=BigInt(selected.permissions||'0')}catch{throw new Error('Discord returned invalid server permissions')}
    if(!selected.owner&&(permissions&ADMINISTRATOR)===0n&&(permissions&MANAGE_GUILD)===0n)throw new Error('Manage Server permission is required to connect this Discord server')

    const guild=await botGuild(guildId)
    const admin=createAdminSupabase()
    const{error}=await admin.from('discord_guild_connections').upsert({owner_id:user.id,guild_id:guildId,guild_name:guild.name,guild_icon:guild.icon||null,installed_by_discord_user_id:String(discordUser.id),last_verified_at:new Date().toISOString()},{onConflict:'owner_id'})
    if(error)throw error

    return clearState(NextResponse.redirect(new URL('/dashboard/badges?discord=connected',APP_URL)))
  }catch(e){
    console.error('Discord connect failed',e)
    return clearState(NextResponse.redirect(new URL('/dashboard/badges?discord=error',APP_URL)))
  }
}

function clearState(response:NextResponse){
  response.cookies.set('ctci_discord_state','',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0})
  return response
}
