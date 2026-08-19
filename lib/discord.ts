const DISCORD_API='https://discord.com/api/v10'
export const APP_URL=(process.env.NEXT_PUBLIC_APP_URL||'https://chromachat.syntax-xxx.is-a.dev').replace(/\/$/,'')
export const DISCORD_REDIRECT_URI=`${APP_URL}/api/discord/callback`
export function discordClientId(){const v=process.env.DISCORD_CLIENT_ID;if(!v)throw new Error('DISCORD_CLIENT_ID is not configured');return v}
export function discordClientSecret(){const v=process.env.DISCORD_CLIENT_SECRET;if(!v)throw new Error('DISCORD_CLIENT_SECRET is not configured');return v}
export function discordBotToken(){const v=process.env.DISCORD_BOT_TOKEN;if(!v)throw new Error('DISCORD_BOT_TOKEN is not configured');return v}
export async function exchangeDiscordCode(code:string){const body=new URLSearchParams({client_id:discordClientId(),client_secret:discordClientSecret(),grant_type:'authorization_code',code,redirect_uri:DISCORD_REDIRECT_URI});const r=await fetch(`${DISCORD_API}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'});if(!r.ok)throw new Error(`Discord token exchange failed: ${r.status}`);return r.json() as Promise<any>}
export async function discordMe(access:string){const r=await fetch(`${DISCORD_API}/users/@me`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});if(!r.ok)throw new Error(`Discord user lookup failed: ${r.status}`);return r.json() as Promise<any>}
export async function botGuild(guildId:string){const r=await fetch(`${DISCORD_API}/guilds/${guildId}`,{headers:{Authorization:`Bot ${discordBotToken()}`},cache:'no-store'});if(!r.ok)throw new Error(`CTCI bot cannot access selected Discord server (${r.status})`);return r.json() as Promise<any>}
export async function botGuildRoles(guildId:string){const r=await fetch(`${DISCORD_API}/guilds/${guildId}/roles`,{headers:{Authorization:`Bot ${discordBotToken()}`},cache:'no-store'});if(!r.ok)throw new Error(`Could not load Discord roles (${r.status})`);return r.json() as Promise<any[]>}
