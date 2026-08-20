import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const API='https://www.googleapis.com/youtube/v3'

export async function GET(request:NextRequest){
  const slug=String(request.nextUrl.searchParams.get('slug')||'').trim()
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(slug))return NextResponse.json({error:'Invalid overlay slug'},{status:400})
  const key=process.env.YOUTUBE_API_KEY
  if(!key)return NextResponse.json({error:'YouTube integration is not configured',nextPollMs:15000},{status:503})
  const admin=createAdminSupabase()
  try{
    const{data:overlay,error}=await admin.from('overlays').select('id,user_id,enabled,show_youtube_chat,youtube_video_id,youtube_live_chat_id,youtube_next_page_token,youtube_next_poll_at').eq('slug',slug).maybeSingle()
    if(error)throw error
    if(!overlay?.enabled||!overlay.show_youtube_chat)return NextResponse.json({ok:true,enabled:false,nextPollMs:15000})
    const videoId=String(overlay.youtube_video_id||'')
    if(!/^[A-Za-z0-9_-]{6,20}$/.test(videoId))return NextResponse.json({ok:true,enabled:true,connected:false,error:'Add a valid YouTube livestream URL or video ID in CTCI.',nextPollMs:15000})
    const nextAt=overlay.youtube_next_poll_at?Date.parse(overlay.youtube_next_poll_at):0
    if(Number.isFinite(nextAt)&&nextAt>Date.now())return NextResponse.json({ok:true,enabled:true,connected:!!overlay.youtube_live_chat_id,nextPollMs:Math.max(1000,nextAt-Date.now())})

    let liveChatId=String(overlay.youtube_live_chat_id||'')
    if(!liveChatId){
      const video=await youtube(`${API}/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`)
      liveChatId=String(video.items?.[0]?.liveStreamingDetails?.activeLiveChatId||'')
      if(!liveChatId){
        await admin.from('overlays').update({youtube_next_poll_at:new Date(Date.now()+15000).toISOString()}).eq('id',overlay.id)
        return NextResponse.json({ok:true,enabled:true,connected:false,error:'This YouTube video does not currently have an active live chat.',nextPollMs:15000})
      }
      await admin.from('overlays').update({youtube_live_chat_id:liveChatId,youtube_next_page_token:null}).eq('id',overlay.id)
    }

    const params=new URLSearchParams({liveChatId,part:'id,snippet,authorDetails',maxResults:'200',key})
    if(overlay.youtube_next_page_token)params.set('pageToken',String(overlay.youtube_next_page_token))
    const response=await youtube(`${API}/liveChat/messages?${params}`)
    const items=Array.isArray(response.items)?response.items:[]
    const rows=items.flatMap((item:any)=>{
      const text=String(item?.snippet?.displayMessage||'').trim()
      const author=item?.authorDetails||{}
      const publishedAt=String(item?.snippet?.publishedAt||new Date().toISOString())
      if(!text||!item?.id)return[]
      return[{id:`youtube:${item.id}`,overlay_id:overlay.id,broadcaster_user_id:`youtube:${videoId}`,broadcaster_login:`youtube:${videoId}`,chatter_user_id:String(author.channelId||`youtube:${item.id}`),chatter_login:String(author.channelId||author.displayName||'youtube').toLowerCase(),chatter_name:`🔴▶ ${String(author.displayName||'YouTube')}`,message_text:text,color:null,badges:youtubeBadges(author),fragments:[],reply:null,source:'youtube',created_at:publishedAt}]
    })
    if(rows.length){
      const{error:insertError}=await admin.from('chat_events').upsert(rows,{onConflict:'id',ignoreDuplicates:true})
      if(insertError)throw insertError
    }
    const interval=clamp(Number(response.pollingIntervalMillis)||5000,1000,30000)
    const update:any={youtube_live_chat_id:liveChatId,youtube_next_page_token:response.nextPageToken||null,youtube_next_poll_at:new Date(Date.now()+interval).toISOString(),youtube_last_sync_at:new Date().toISOString()}
    if(response.offlineAt){update.youtube_live_chat_id=null;update.youtube_next_page_token=null;update.youtube_next_poll_at=new Date(Date.now()+15000).toISOString()}
    const{error:updateError}=await admin.from('overlays').update(update).eq('id',overlay.id)
    if(updateError)throw updateError
    return NextResponse.json({ok:true,enabled:true,connected:!response.offlineAt,inserted:rows.length,nextPollMs:response.offlineAt?15000:interval})
  }catch(error:any){
    console.error('YouTube live chat sync failed',error)
    const status=Number(error?.status)||500
    return NextResponse.json({error:'Failed to sync YouTube live chat',details:status===403?'Check YouTube Data API quota/key restrictions.':undefined,nextPollMs:15000},{status:status===400||status===403?status:500})
  }
}

async function youtube(url:string){
  const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}})
  const body=await response.json().catch(()=>({}))
  if(!response.ok){const error:any=new Error(body?.error?.message||`YouTube API ${response.status}`);error.status=response.status;throw error}
  return body
}
function youtubeBadges(author:any){const badges:any[]=[];if(author?.isChatOwner)badges.push({set_id:'broadcaster',id:'youtube-owner'});if(author?.isChatModerator)badges.push({set_id:'moderator',id:'youtube-moderator'});if(author?.isChatSponsor)badges.push({set_id:'subscriber',id:'youtube-member'});if(author?.isVerified)badges.push({set_id:'verified',id:'youtube-verified'});return badges}
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value))}
