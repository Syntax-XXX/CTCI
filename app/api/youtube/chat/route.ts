import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getActiveYouTubeBroadcast,getValidYouTubeToken,listYouTubeChat } from '@/lib/youtube'
import { awardActivity,handleEngagementCommand } from '@/lib/engagement'
import { evaluateModeration } from '@/lib/moderation'
import { runAutomations } from '@/lib/automation'
import { touchStreamSession } from '@/lib/sessions'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const API='https://www.googleapis.com/youtube/v3'

export async function GET(request:NextRequest){
  const slug=String(request.nextUrl.searchParams.get('slug')||'').trim()
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(slug))return NextResponse.json({error:'Invalid overlay slug'},{status:400})
  const admin=createAdminSupabase()
  try{
    const{data:overlay,error}=await admin.from('overlays').select('id,user_id,enabled,command_prefix,show_youtube_chat,youtube_auto_detect,youtube_video_id,youtube_live_chat_id,youtube_next_page_token,youtube_next_poll_at,youtube_active_title').eq('slug',slug).maybeSingle()
    if(error)throw error
    if(!overlay?.enabled||!overlay.show_youtube_chat)return NextResponse.json({ok:true,enabled:false,nextPollMs:15000})
    const nextAt=overlay.youtube_next_poll_at?Date.parse(overlay.youtube_next_poll_at):0
    if(Number.isFinite(nextAt)&&nextAt>Date.now())return NextResponse.json({ok:true,enabled:true,connected:!!overlay.youtube_live_chat_id,nextPollMs:Math.max(1000,nextAt-Date.now())})

    const oauth=await getValidYouTubeToken(admin,overlay.user_id).catch(()=>null)
    if(overlay.youtube_auto_detect&&oauth){
      let liveChatId=String(overlay.youtube_live_chat_id||''),videoId=String(overlay.youtube_video_id||''),title=String(overlay.youtube_active_title||'')
      if(!liveChatId){
        const active=await getActiveYouTubeBroadcast(oauth.access_token)
        if(!active?.id||!active.liveChatId){const wait=30000;await admin.from('overlays').update({youtube_video_id:null,youtube_live_chat_id:null,youtube_active_title:null,youtube_last_discovery_at:new Date().toISOString(),youtube_next_poll_at:new Date(Date.now()+wait).toISOString(),youtube_next_page_token:null}).eq('id',overlay.id);return NextResponse.json({ok:true,enabled:true,connected:false,autoDetect:true,error:'No active YouTube livestream yet. CTCI will attach automatically when you go live.',nextPollMs:wait})}
        videoId=active.id;liveChatId=active.liveChatId;title=active.title
        await admin.from('overlays').update({youtube_video_id:videoId,youtube_live_chat_id:liveChatId,youtube_active_title:title,youtube_last_discovery_at:new Date().toISOString(),youtube_next_page_token:null}).eq('id',overlay.id)
      }
      try{await touchStreamSession(admin,overlay.user_id,{source:'youtube',streamId:videoId,title:title||'YouTube Live'})}catch(error){console.error('YouTube stream session tracking failed',error)}
      return syncOAuthChat(admin,overlay,oauth.access_token,videoId,liveChatId)
    }

    const key=process.env.YOUTUBE_API_KEY
    if(!key)return NextResponse.json({error:'Connect YouTube in Chat Sources or configure YOUTUBE_API_KEY for manual mode.',nextPollMs:15000},{status:503})
    const videoId=String(overlay.youtube_video_id||'')
    if(!/^[A-Za-z0-9_-]{6,20}$/.test(videoId))return NextResponse.json({ok:true,enabled:true,connected:false,error:'Connect YouTube for automatic detection, or add a valid livestream URL in manual mode.',nextPollMs:15000})
    let liveChatId=String(overlay.youtube_live_chat_id||'')
    if(!liveChatId){const video=await youtubeKey(`${API}/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`);liveChatId=String(video.items?.[0]?.liveStreamingDetails?.activeLiveChatId||'');if(!liveChatId){await admin.from('overlays').update({youtube_next_poll_at:new Date(Date.now()+15000).toISOString()}).eq('id',overlay.id);return NextResponse.json({ok:true,enabled:true,connected:false,error:'This YouTube video does not currently have an active live chat.',nextPollMs:15000})}await admin.from('overlays').update({youtube_live_chat_id:liveChatId,youtube_next_page_token:null}).eq('id',overlay.id)}
    try{await touchStreamSession(admin,overlay.user_id,{source:'youtube',streamId:videoId,title:'YouTube Live'})}catch(error){console.error('YouTube stream session tracking failed',error)}
    const params=new URLSearchParams({liveChatId,part:'id,snippet,authorDetails',maxResults:'200',key});if(overlay.youtube_next_page_token)params.set('pageToken',String(overlay.youtube_next_page_token));const response=await youtubeKey(`${API}/liveChat/messages?${params}`);return persistChat(admin,overlay,videoId,liveChatId,response,false)
  }catch(error:any){console.error('YouTube live chat sync failed',error);const status=Number(error?.status)||500;return NextResponse.json({error:'Failed to sync YouTube live chat',details:status===403?'Check YouTube permissions/quota or reconnect YouTube.':undefined,nextPollMs:15000},{status:status===400||status===401||status===403?status:500})}
}
async function syncOAuthChat(admin:any,overlay:any,token:string,videoId:string,liveChatId:string){try{const response=await listYouTubeChat(token,liveChatId,overlay.youtube_next_page_token);return persistChat(admin,overlay,videoId,liveChatId,response,true)}catch(error:any){if([403,404].includes(Number(error?.status))){const wait=10000;await admin.from('overlays').update({youtube_video_id:null,youtube_live_chat_id:null,youtube_next_page_token:null,youtube_next_poll_at:new Date(Date.now()+wait).toISOString(),youtube_active_title:null}).eq('id',overlay.id);return NextResponse.json({ok:true,enabled:true,connected:false,autoDetect:true,nextPollMs:wait})}throw error}}

async function persistChat(admin:any,overlay:any,videoId:string,liveChatId:string,response:any,autoDetect:boolean){
  const items=Array.isArray(response.items)?response.items:[],rows:any[]=[]
  for(const item of items){
    const snippet=item?.snippet||{},author=item?.authorDetails||{},type=String(snippet.type||'textMessageEvent'),text=messageText(snippet,type)
    if(!text||!item?.id)continue
    const eventId=`youtube:${item.id}`
    const actor={source:'youtube' as const,userId:String(author.channelId||eventId),login:String(author.channelId||author.displayName||'youtube').toLowerCase(),displayName:String(author.displayName||'YouTube'),roles:youtubeRoles(author),eventId}
    const kind=eventType(type)
    let moderation={blocked:false,flagged:false} as any
    if(kind==='message')moderation=await evaluateModeration(admin,{ownerId:overlay.user_id,source:'youtube',userId:actor.userId,displayName:actor.displayName,text})
    if(moderation.blocked){await runAutomations(admin,overlay.user_id,{type:'moderation_action',source:'youtube',text,userId:actor.userId,displayName:actor.displayName,metadata:{reason:moderation.reason||'',action:moderation.action||'hide'}});continue}
    const engagement=kind==='message'?await handleEngagementCommand(admin,overlay.user_id,actor,text,overlay.command_prefix||'CC!'):{handled:false}
    if(engagement.handled){await runAutomations(admin,overlay.user_id,{type:'command',source:'youtube',text,userId:actor.userId,displayName:actor.displayName,metadata:{kind:'engagement'}});continue}
    if(kind==='message'){try{await awardActivity(admin,overlay.user_id,actor)}catch(error){console.error('YouTube loyalty award failed',error)}}
    await runAutomations(admin,overlay.user_id,{type:kind==='message'?'chat_message':'paid_event',source:'youtube',text,userId:actor.userId,displayName:actor.displayName,eventType:kind,metadata:eventData(snippet,type)})
    rows.push({id:eventId,overlay_id:overlay.id,broadcaster_user_id:`youtube:${videoId}`,broadcaster_login:`youtube:${videoId}`,chatter_user_id:actor.userId,chatter_login:actor.login,chatter_name:actor.displayName,message_text:text,color:null,badges:youtubeBadges(author),fragments:[],reply:null,source:'youtube',event_type:kind,event_data:{...eventData(snippet,type),...(moderation.flagged?{moderation:{flagged:true,reason:moderation.reason}}:{})},created_at:String(snippet.publishedAt||new Date().toISOString())})
  }
  if(rows.length){const{error}=await admin.from('chat_events').upsert(rows,{onConflict:'id',ignoreDuplicates:true});if(error)throw error}
  const interval=clamp(Number(response.pollingIntervalMillis)||5000,1000,30000),offline=!!response.offlineAt,update:any={youtube_live_chat_id:offline?null:liveChatId,youtube_video_id:offline&&autoDetect?null:videoId,youtube_next_page_token:offline?null:(response.nextPageToken||null),youtube_next_poll_at:new Date(Date.now()+(offline?10000:interval)).toISOString(),youtube_last_sync_at:new Date().toISOString()};if(offline)update.youtube_active_title=null;const{error}=await admin.from('overlays').update(update).eq('id',overlay.id);if(error)throw error
  return NextResponse.json({ok:true,enabled:true,connected:!offline,autoDetect,videoId:offline?null:videoId,inserted:rows.length,nextPollMs:offline?10000:interval})
}
function eventType(type:string){if(type==='superChatEvent')return'super_chat';if(type==='superStickerEvent')return'super_sticker';if(type==='newSponsorEvent'||type==='memberMilestoneChatEvent')return'membership';if(type==='membershipGiftingEvent'||type==='giftMembershipReceivedEvent')return'membership_gift';return'message'}
function eventData(snippet:any,type:string){if(type==='superChatEvent')return snippet.superChatDetails||{};if(type==='superStickerEvent')return snippet.superStickerDetails||{};if(type==='memberMilestoneChatEvent')return snippet.memberMilestoneChatDetails||{};if(type==='membershipGiftingEvent')return snippet.membershipGiftingDetails||{};if(type==='giftMembershipReceivedEvent')return snippet.giftMembershipReceivedDetails||{};return{}}
function messageText(snippet:any,type:string){const display=String(snippet.displayMessage||'').trim();if(display)return display;if(type==='newSponsorEvent')return'became a YouTube member';if(type==='membershipGiftingEvent')return'gifted YouTube memberships';if(type==='giftMembershipReceivedEvent')return'received a gifted YouTube membership';return''}
async function youtubeKey(url:string){const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});const body=await response.json().catch(()=>({}));if(!response.ok){const error:any=new Error(body?.error?.message||`YouTube API ${response.status}`);error.status=response.status;throw error}return body}
function youtubeBadges(author:any){const badges:any[]=[];if(author?.isChatOwner)badges.push({set_id:'broadcaster',id:'youtube-owner'});if(author?.isChatModerator)badges.push({set_id:'moderator',id:'youtube-moderator'});if(author?.isChatSponsor)badges.push({set_id:'subscriber',id:'youtube-member'});if(author?.isVerified)badges.push({set_id:'verified',id:'youtube-verified'});return badges}
function youtubeRoles(author:any){const roles=['viewer'];if(author?.isChatOwner)roles.push('broadcaster');if(author?.isChatModerator)roles.push('moderator');if(author?.isChatSponsor)roles.push('subscriber');return roles}
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value))}
