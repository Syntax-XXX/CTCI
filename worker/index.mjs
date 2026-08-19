import { Client, GatewayIntentBits, ActivityType } from 'discord.js'
import { createClient } from '@supabase/supabase-js'

const DISCORD_BOT_TOKEN=required('DISCORD_BOT_TOKEN')
const SUPABASE_URL=required('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY is required')
const TWITCH_CLIENT_ID=required('TWITCH_CLIENT_ID')

const supabase=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
const discord=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]})

discord.once('ready',()=>{
  console.log(`CTCI Discord Gateway online as ${discord.user?.tag}`)
  discord.user?.setPresence({status:'online',activities:[{name:'Twitch ↔ Discord chat',type:ActivityType.Watching}]})
})

discord.on('messageCreate',async message=>{
  if(!message.guildId||message.author.bot||message.webhookId)return
  const content=buildDiscordContent(message)
  if(!content)return
  try{
    const{data:syncRows,error:syncError}=await supabase
      .from('discord_chat_sync')
      .select('owner_id,guild_id,channel_id,enabled,discord_to_twitch_enabled')
      .eq('guild_id',message.guildId)
      .eq('channel_id',message.channelId)
      .eq('enabled',true)
      .eq('discord_to_twitch_enabled',true)
    if(syncError)throw syncError
    for(const sync of syncRows||[])await relayToTwitch(sync.owner_id,message,content)
  }catch(error){
    console.error('Discord → Twitch relay failed',error)
  }
})

discord.on('error',error=>console.error('Discord client error',error))
process.on('unhandledRejection',error=>console.error('Unhandled rejection',error))

await discord.login(DISCORD_BOT_TOKEN)

async function relayToTwitch(ownerId,message,content){
  const[{data:profile,error:profileError},{data:creds,error:credsError}]=await Promise.all([
    supabase.from('profiles').select('twitch_user_id,twitch_login').eq('id',ownerId).maybeSingle(),
    supabase.from('twitch_credentials').select('access_token,scopes').eq('user_id',ownerId).maybeSingle(),
  ])
  if(profileError)throw profileError
  if(credsError)throw credsError
  if(!profile?.twitch_user_id||!creds?.access_token)return
  const scopes=Array.isArray(creds.scopes)?creds.scopes:[]
  if(!scopes.includes('user:write:chat')){
    console.warn(`Discord → Twitch skipped for ${profile.twitch_login||ownerId}: reconnect Twitch to grant user:write:chat`)
    return
  }

  const author=(message.member?.displayName||message.author.globalName||message.author.username).replace(/[\r\n]+/g,' ').slice(0,60)
  const outgoing=`[Discord] ${author}: ${content}`.slice(0,500)
  const response=await fetch('https://api.twitch.tv/helix/chat/messages',{
    method:'POST',
    headers:{
      Authorization:`Bearer ${creds.access_token}`,
      'Client-Id':TWITCH_CLIENT_ID,
      'Content-Type':'application/json',
    },
    body:JSON.stringify({
      broadcaster_id:profile.twitch_user_id,
      sender_id:profile.twitch_user_id,
      message:outgoing,
    }),
  })
  if(!response.ok)throw new Error(`Twitch send failed: ${response.status} ${await response.text()}`)
}

function buildDiscordContent(message){
  const text=String(message.content||'').trim().replace(/[\r\n]+/g,' ')
  const attachments=[...message.attachments.values()].slice(0,2).map(file=>file.url)
  return[text,...attachments].filter(Boolean).join(' ').slice(0,420)
}

function required(name){
  const value=process.env[name]
  if(!value)throw new Error(`${name} is required`)
  return value
}
