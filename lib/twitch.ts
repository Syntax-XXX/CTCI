const TWITCH_ID_BASE = 'https://id.twitch.tv/oauth2'
const TWITCH_API_BASE = 'https://api.twitch.tv/helix'

export const TWITCH_SCOPES = ['user:read:chat', 'user:write:chat', 'user:bot', 'channel:bot']
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://chromachat.syntax-xxx.is-a.dev').replace(/\/$/, '')
export const TWITCH_REDIRECT_URI = `${APP_URL}/api/auth/callback`
export const TWITCH_EVENTSUB_CALLBACK = `${APP_URL}/api/twitch/eventsub`

export function getTwitchClientId() {
  const value = process.env.TWITCH_CLIENT_ID
  if (!value) throw new Error('TWITCH_CLIENT_ID is not configured')
  return value
}

export function getTwitchClientSecret() {
  const value = process.env.TWITCH_CLIENT_SECRET
  if (!value) throw new Error('TWITCH_CLIENT_SECRET is not configured')
  return value
}

export function getEventSubSecret() {
  const value = process.env.TWITCH_EVENTSUB_SECRET
  if (!value || value.length < 10 || value.length > 100) throw new Error('TWITCH_EVENTSUB_SECRET must be 10-100 ASCII characters')
  return value
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({client_id:getTwitchClientId(),client_secret:getTwitchClientSecret(),code,grant_type:'authorization_code',redirect_uri:TWITCH_REDIRECT_URI})
  const res = await fetch(`${TWITCH_ID_BASE}/token`, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'})
  if (!res.ok) throw new Error(`Twitch token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token:string; refresh_token:string; expires_in:number; scope:string[]; token_type:string }>
}

export async function refreshTwitchUserTokens(refreshToken:string) {
  const body = new URLSearchParams({client_id:getTwitchClientId(),client_secret:getTwitchClientSecret(),grant_type:'refresh_token',refresh_token:refreshToken})
  const res = await fetch(`${TWITCH_ID_BASE}/token`, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'})
  if (!res.ok) throw new Error(`Twitch token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token:string; refresh_token:string; expires_in:number; scope:string[]; token_type:string }>
}

export async function getValidTwitchUserToken(admin:any,userId:string) {
  const {data:creds,error}=await admin.from('twitch_credentials').select('access_token,refresh_token,expires_at,scopes').eq('user_id',userId).maybeSingle()
  if(error)throw error
  if(!creds?.access_token)return null
  const expiresAt=Date.parse(String(creds.expires_at||''))
  if(Number.isFinite(expiresAt)&&expiresAt-Date.now()>5*60*1000)return creds
  if(!creds.refresh_token)throw new Error('Twitch credentials expired and no refresh token is available')
  const refreshed=await refreshTwitchUserTokens(creds.refresh_token)
  const next={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||creds.refresh_token,expires_at:new Date(Date.now()+refreshed.expires_in*1000).toISOString(),scopes:refreshed.scope}
  const {error:updateError}=await admin.from('twitch_credentials').update(next).eq('user_id',userId)
  if(updateError)throw updateError
  return next
}

export async function getTwitchUser(accessToken: string) {
  const res = await fetch(`${TWITCH_API_BASE}/users`, {headers:{Authorization:`Bearer ${accessToken}`,'Client-Id':getTwitchClientId()},cache:'no-store'})
  if (!res.ok) throw new Error(`Twitch user lookup failed: ${res.status} ${await res.text()}`)
  const body = await res.json() as {data?:Array<{id:string;login:string;display_name:string;profile_image_url:string}>}
  if (!body.data?.[0]) throw new Error('Twitch returned no user for this authorization')
  return body.data[0]
}

export async function getAppAccessToken() {
  const body = new URLSearchParams({client_id:getTwitchClientId(),client_secret:getTwitchClientSecret(),grant_type:'client_credentials'})
  const res = await fetch(`${TWITCH_ID_BASE}/token`, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'})
  if (!res.ok) throw new Error(`Twitch app token request failed: ${res.status} ${await res.text()}`)
  return (await res.json() as {access_token:string}).access_token
}

export async function sendTwitchChatMessage(input:{accessToken:string;broadcasterId:string;senderId:string;message:string;replyParentMessageId?:string}) {
  const message=input.message.trim().slice(0,500)
  if(!message)return null
  const res=await fetch(`${TWITCH_API_BASE}/chat/messages`,{method:'POST',headers:{Authorization:`Bearer ${input.accessToken}`,'Client-Id':getTwitchClientId(),'Content-Type':'application/json'},body:JSON.stringify({broadcaster_id:input.broadcasterId,sender_id:input.senderId,message,...(input.replyParentMessageId?{reply_parent_message_id:input.replyParentMessageId}:{})}),cache:'no-store'})
  const text=await res.text()
  if(!res.ok)throw new Error(`Twitch chat send failed: ${res.status} ${text}`)
  return text?JSON.parse(text):null
}

export async function createChatSubscription(broadcasterUserId: string) {
  const appToken = await getAppAccessToken()
  const res = await fetch(`${TWITCH_API_BASE}/eventsub/subscriptions`, {
    method: 'POST',
    headers: {Authorization:`Bearer ${appToken}`,'Client-Id':getTwitchClientId(),'Content-Type':'application/json'},
    body: JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:broadcasterUserId,user_id:broadcasterUserId},transport:{method:'webhook',callback:TWITCH_EVENTSUB_CALLBACK,secret:getEventSubSecret()}}),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok && res.status !== 409) throw new Error(`EventSub subscription failed: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}
