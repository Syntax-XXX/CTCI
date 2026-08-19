const DISCORD_API='https://discord.com/api/v10'
export const APP_URL=(process.env.NEXT_PUBLIC_APP_URL||'https://chromachat.syntax-xxx.is-a.dev').replace(/\/$/,'')
export const DISCORD_REDIRECT_URI=`${APP_URL}/api/discord/callback`
export function discordClientId(){const v=process.env.DISCORD_CLIENT_ID;if(!v)throw new Error('DISCORD_CLIENT_ID is not configured');return v}
export function discordClientSecret(){const v=process.env.DISCORD_CLIENT_SECRET;if(!v)throw new Error('DISCORD_CLIENT_SECRET is not configured');return v}
export function discordBotToken(){const v=process.env.DISCORD_BOT_TOKEN;if(!v)throw new Error('DISCORD_BOT_TOKEN is not configured');return v}
export async function exchangeDiscordCode(code:string){const body=new URLSearchParams({client_id:discordClientId(),client_secret:discordClientSecret(),grant_type:'authorization_code',code,redirect_uri:DISCORD_REDIRECT_URI});const r=await fetch(`${DISCORD_API}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'});if(!r.ok)throw new Error(`Discord token exchange failed: ${r.status}`);return r.json() as Promise<any>}
export async function discordMe(access:string){const r=await fetch(`${DISCORD_API}/users/@me`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});if(!r.ok)throw new Error(`Discord user lookup failed: ${r.status}`);return r.json() as Promise<any>}
export async function discordUserGuilds(access:string){const r=await fetch(`${DISCORD_API}/users/@me/guilds`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});if(!r.ok)throw new Error(`Discord guild lookup failed: ${r.status}`);return r.json() as Promise<Array<{id:string;name:string;permissions:string;owner?:boolean}>>}
export async function botGuild(guildId:string){const r=await fetch(`${DISCORD_API}/guilds/${guildId}`,{headers:{Authorization:`Bot ${discordBotToken()}`},cache:'no-store'});if(!r.ok)throw new Error(`CTCI bot cannot access selected Discord server (${r.status})`);return r.json() as Promise<any>}
export async function botGuildRoles(guildId:string){const r=await fetch(`${DISCORD_API}/guilds/${guildId}/roles`,{headers:{Authorization:`Bot ${discordBotToken()}`},cache:'no-store'});if(!r.ok)throw new Error(`Could not load Discord roles (${r.status})`);return r.json() as Promise<any[]>}
export async function botGuildChannels(guildId:string){const r=await fetch(`${DISCORD_API}/guilds/${guildId}/channels`,{headers:{Authorization:`Bot ${discordBotToken()}`},cache:'no-store'});if(!r.ok)throw new Error(`Could not load Discord channels (${r.status})`);return r.json() as Promise<any[]>}

export type DiscordChatEmbedInput={
  channelId:string
  chatterName:string
  chatterLogin:string
  message:string
  broadcasterLogin?:string
  isCommand?:boolean
  timestamp?:string
  color?:string|null
}

export async function sendDiscordChannelMessage(channelId:string,content:string){
  const safe=content.trim().slice(0,2000)
  if(!safe)return null
  return sendDiscordPayload(channelId,{content:safe,allowed_mentions:{parse:[]}})
}

export async function sendDiscordChatEmbed(input:DiscordChatEmbedInput){
  const chatterName=cleanDiscordText(input.chatterName,256)||'Twitch chatter'
  const chatterLogin=cleanDiscordText(input.chatterLogin,100)
  const description=cleanDiscordText(input.message,3800)
  if(!description)return null
  const broadcaster=cleanDiscordText(input.broadcasterLogin||'',100)
  const twitchUrl=broadcaster?`https://www.twitch.tv/${encodeURIComponent(broadcaster)}`:undefined
  const embedColor=parseDiscordColor(input.color)??0x9147ff
  const footerParts=['Twitch Chat','CTCI']
  if(input.isCommand)footerParts.unshift('Command')
  const embed:any={
    color:embedColor,
    author:{name:chatterLogin&&chatterLogin.toLowerCase()!==chatterName.toLowerCase()?`${chatterName} (@${chatterLogin})`:chatterName},
    description,
    footer:{text:footerParts.join(' • ')},
    timestamp:validIsoTimestamp(input.timestamp),
  }
  if(twitchUrl)embed.url=twitchUrl
  return sendDiscordPayload(input.channelId,{embeds:[embed],allowed_mentions:{parse:[]}})
}

async function sendDiscordPayload(channelId:string,payload:Record<string,unknown>){
  const id=String(channelId||'').trim()
  if(!/^\d{5,30}$/.test(id))throw new Error('Invalid Discord channel ID')
  const r=await fetch(`${DISCORD_API}/channels/${encodeURIComponent(id)}/messages`,{method:'POST',headers:{Authorization:`Bot ${discordBotToken()}`,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'})
  const text=await r.text()
  if(!r.ok)throw new Error(`Discord message send failed: ${r.status} ${text.slice(0,1000)}`)
  return text?JSON.parse(text):null
}

function cleanDiscordText(value:string,max:number){
  return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/@/g,'＠').trim().slice(0,max)
}

function validIsoTimestamp(value?:string){
  const time=Date.parse(String(value||''))
  return Number.isFinite(time)?new Date(time).toISOString():new Date().toISOString()
}

function parseDiscordColor(value?:string|null){
  const raw=String(value||'').trim()
  if(!/^#[0-9a-fA-F]{6}$/.test(raw))return null
  return Number.parseInt(raw.slice(1),16)
}
