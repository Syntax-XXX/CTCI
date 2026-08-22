const GOOGLE_TOKEN='https://oauth2.googleapis.com/token'
const YOUTUBE_API='https://www.googleapis.com/youtube/v3'

export const YOUTUBE_SCOPES=['https://www.googleapis.com/auth/youtube.force-ssl']
export const YOUTUBE_REDIRECT_URI=`${process.env.NEXT_PUBLIC_APP_URL||'https://chromachat.syntax-xxx.is-a.dev'}/api/youtube/callback`

export function getYouTubeClientId(){const v=process.env.YOUTUBE_CLIENT_ID;if(!v)throw new Error('YOUTUBE_CLIENT_ID is not configured');return v}
export function getYouTubeClientSecret(){const v=process.env.YOUTUBE_CLIENT_SECRET;if(!v)throw new Error('YOUTUBE_CLIENT_SECRET is not configured');return v}

export async function exchangeYouTubeCode(code:string){
  const body=new URLSearchParams({code,client_id:getYouTubeClientId(),client_secret:getYouTubeClientSecret(),redirect_uri:YOUTUBE_REDIRECT_URI,grant_type:'authorization_code'})
  return googleToken(body)
}

export async function refreshYouTubeToken(refreshToken:string){
  const body=new URLSearchParams({refresh_token:refreshToken,client_id:getYouTubeClientId(),client_secret:getYouTubeClientSecret(),grant_type:'refresh_token'})
  return googleToken(body)
}

async function googleToken(body:URLSearchParams){
  const r=await fetch(GOOGLE_TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'})
  const j=await r.json().catch(()=>({}))
  if(!r.ok)throw new Error(j.error_description||j.error||`Google OAuth ${r.status}`)
  return j as {access_token:string;expires_in:number;refresh_token?:string;scope?:string;token_type:string}
}

export async function getValidYouTubeToken(admin:any,userId:string){
  const{data,error}=await admin.from('youtube_credentials').select('*').eq('user_id',userId).maybeSingle();if(error)throw error;if(!data)return null
  if(Date.parse(data.expires_at)-Date.now()>60_000)return data
  if(!data.refresh_token)throw new Error('YouTube refresh token is missing; reconnect YouTube')
  const next=await refreshYouTubeToken(data.refresh_token)
  const update={access_token:next.access_token,refresh_token:next.refresh_token||data.refresh_token,expires_at:new Date(Date.now()+next.expires_in*1000).toISOString(),scopes:(next.scope||'').split(' ').filter(Boolean),updated_at:new Date().toISOString()}
  const saved=await admin.from('youtube_credentials').update(update).eq('user_id',userId).select('*').single();if(saved.error)throw saved.error;return saved.data
}

async function youtube(accessToken:string,path:string,init?:RequestInit){
  const r=await fetch(`${YOUTUBE_API}${path}`,{...init,headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json',...(init?.body?{'Content-Type':'application/json'}:{}),...(init?.headers||{})},cache:'no-store'})
  const j=await r.json().catch(()=>({}))
  if(!r.ok){const e:any=new Error(j?.error?.message||`YouTube API ${r.status}`);e.status=r.status;throw e}
  return j
}

export async function getOwnYouTubeChannel(accessToken:string){
  const j=await youtube(accessToken,'/channels?part=id,snippet&mine=true&maxResults=1')
  const item=j.items?.[0];if(!item?.id)throw new Error('No YouTube channel is linked to this Google account')
  return{id:String(item.id),title:String(item.snippet?.title||'YouTube')}
}

export async function getActiveYouTubeBroadcast(accessToken:string){
  // liveBroadcasts.list requires exactly one primary filter. `broadcastStatus=active`
  // already scopes the authorized request to the current account's matching broadcasts;
  // combining it with `mine=true` returns HTTP 400 (incompatible parameters).
  const j=await youtube(accessToken,'/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&maxResults=50')
  const items=Array.isArray(j.items)?j.items:[]
  if(!items.length)return null
  items.sort((a:any,b:any)=>Date.parse(b?.snippet?.actualStartTime||b?.snippet?.scheduledStartTime||b?.snippet?.publishedAt||0)-Date.parse(a?.snippet?.actualStartTime||a?.snippet?.scheduledStartTime||a?.snippet?.publishedAt||0))
  const item=items[0]
  return{id:String(item.id),title:String(item.snippet?.title||'YouTube Live'),liveChatId:String(item.snippet?.liveChatId||''),startedAt:item.snippet?.actualStartTime||item.snippet?.scheduledStartTime||null}
}

export async function listYouTubeChat(accessToken:string,liveChatId:string,pageToken?:string|null){
  const params=new URLSearchParams({liveChatId,part:'id,snippet,authorDetails',maxResults:'200'})
  if(pageToken)params.set('pageToken',pageToken)
  return youtube(accessToken,`/liveChat/messages?${params}`)
}

export async function sendYouTubeChatMessage(accessToken:string,liveChatId:string,message:string){
  const body={snippet:{liveChatId,type:'textMessageEvent',textMessageDetails:{messageText:message.slice(0,200)}}}
  return youtube(accessToken,'/liveChat/messages?part=snippet',{method:'POST',body:JSON.stringify(body)})
}

export async function deleteYouTubeChatMessage(accessToken:string,messageId:string){
  return youtube(accessToken,`/liveChat/messages?id=${encodeURIComponent(messageId)}`,{method:'DELETE'})
}
