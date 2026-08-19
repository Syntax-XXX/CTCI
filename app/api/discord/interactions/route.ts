import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { verifyDiscordInteractionSignature } from '@/lib/discord'
import { getValidTwitchUserToken, sendTwitchChatMessage } from '@/lib/twitch'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const ADMINISTRATOR=1n<<3n
const MANAGE_GUILD=1n<<5n
const EPHEMERAL=1<<6

export async function POST(request:NextRequest){
  const body=await request.text()
  const timestamp=request.headers.get('x-signature-timestamp')||''
  const signature=request.headers.get('x-signature-ed25519')||''
  if(!verifyDiscordInteractionSignature(timestamp,body,signature))return NextResponse.json({error:'Invalid Discord interaction signature'},{status:401})

  let interaction:any
  try{interaction=JSON.parse(body)}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
  if(interaction.type===1)return NextResponse.json({type:1})
  if(interaction.type!==2||interaction.data?.name!=='twitch')return interactionReply('Unsupported interaction',true)

  const guildId=String(interaction.guild_id||'')
  const discordUserId=String(interaction.member?.user?.id||interaction.user?.id||'')
  const permissionText=String(interaction.member?.permissions||'0')
  const message=String((interaction.data?.options||[]).find((option:any)=>option?.name==='message')?.value||'').trim()
  if(!/^\d{5,30}$/.test(guildId)||!/^\d{5,30}$/.test(discordUserId))return interactionReply('This command must be used inside your connected Discord server.',true)
  if(!message||message.length>450)return interactionReply('Message must contain 1–450 characters.',true)

  const admin=createAdminSupabase()
  try{
    const{data:connection,error:connectionError}=await admin.from('discord_guild_connections').select('owner_id,installed_by_discord_user_id,guild_name').eq('guild_id',guildId).maybeSingle()
    if(connectionError)throw connectionError
    if(!connection)return interactionReply('This Discord server is not connected to a CTCI streamer account.',true)

    let permissions=0n
    try{permissions=BigInt(permissionText)}catch{}
    const allowed=discordUserId===String(connection.installed_by_discord_user_id||'')||(permissions&ADMINISTRATOR)!==0n||(permissions&MANAGE_GUILD)!==0n
    if(!allowed)return interactionReply('You need Manage Server permission to send messages to Twitch through CTCI.',true)

    const{data:profile,error:profileError}=await admin.from('profiles').select('twitch_user_id,twitch_login').eq('id',connection.owner_id).maybeSingle()
    if(profileError)throw profileError
    if(!profile?.twitch_user_id)return interactionReply('The connected streamer needs to reconnect Twitch first.',true)

    const creds=await getValidTwitchUserToken(admin,connection.owner_id)
    if(!creds?.access_token)return interactionReply('No valid Twitch authorization is available. Reconnect Twitch in CTCI.',true)
    const scopes=Array.isArray(creds.scopes)?creds.scopes:[]
    if(!scopes.includes('user:write:chat'))return interactionReply('Reconnect Twitch in CTCI to grant chat sending permission.',true)

    await sendTwitchChatMessage({accessToken:creds.access_token,broadcasterId:profile.twitch_user_id,senderId:profile.twitch_user_id,message:`[Discord] ${message}`})
    return NextResponse.json({type:4,data:{flags:EPHEMERAL,embeds:[{color:0x9147ff,title:'Sent to Twitch',description:message.slice(0,4096),footer:{text:`CTCI • ${profile.twitch_login||connection.guild_name||'Twitch'}`},timestamp:new Date().toISOString()}],allowed_mentions:{parse:[]}}})
  }catch(error){
    console.error('Discord /twitch interaction failed',error)
    return interactionReply('CTCI could not send that message to Twitch. Check the streamer connection and try again.',true)
  }
}

function interactionReply(message:string,ephemeral=false){
  return NextResponse.json({type:4,data:{content:message.slice(0,1900),flags:ephemeral?EPHEMERAL:0,allowed_mentions:{parse:[]}}})
}
