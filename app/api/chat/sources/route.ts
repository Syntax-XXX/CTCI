import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const runtime='nodejs'

export async function GET(){
  const sb=await createServerSupabase()
  const{data:{user}}=await sb.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const admin=createAdminSupabase()
  const{data,error}=await admin.from('overlays').select('show_twitch_chat,show_youtube_chat,youtube_video_id,youtube_last_sync_at').eq('user_id',user.id).single()
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json(data)
}

export async function PATCH(request:NextRequest){
  const sb=await createServerSupabase()
  const{data:{user}}=await sb.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json() as {showTwitch?:boolean;showYouTube?:boolean;youtube?:string}
    const showTwitch=body.showTwitch===true
    const showYouTube=body.showYouTube===true
    if(!showTwitch&&!showYouTube)return NextResponse.json({error:'Keep at least Twitch or YouTube enabled.'},{status:400})
    const videoId=showYouTube?parseYouTubeVideoId(String(body.youtube||'')):null
    if(showYouTube&&!videoId)return NextResponse.json({error:'Enter a valid YouTube livestream URL or video ID.'},{status:400})
    const admin=createAdminSupabase()
    const{data:overlay,error:readError}=await admin.from('overlays').select('id,youtube_video_id').eq('user_id',user.id).single()
    if(readError)throw readError
    const changedVideo=String(overlay.youtube_video_id||'')!==String(videoId||'')
    const update:any={show_twitch_chat:showTwitch,show_youtube_chat:showYouTube,youtube_video_id:videoId}
    if(changedVideo||!showYouTube){update.youtube_live_chat_id=null;update.youtube_next_page_token=null;update.youtube_next_poll_at=null;update.youtube_last_sync_at=null}
    const{error:updateError}=await admin.from('overlays').update(update).eq('id',overlay.id)
    if(updateError)throw updateError
    if(!showTwitch){const{error}=await admin.from('chat_events').delete().eq('overlay_id',overlay.id).eq('source','twitch');if(error)throw error}
    if(!showYouTube){const{error}=await admin.from('chat_events').delete().eq('overlay_id',overlay.id).eq('source','youtube');if(error)throw error}
    return NextResponse.json({ok:true,showTwitch,showYouTube,youtubeVideoId:videoId})
  }catch(error){
    console.error('Chat source update failed',error)
    return NextResponse.json({error:'Failed to update chat sources'},{status:500})
  }
}

function parseYouTubeVideoId(value:string){
  const raw=value.trim()
  if(/^[A-Za-z0-9_-]{6,20}$/.test(raw))return raw
  try{
    const url=new URL(raw)
    const host=url.hostname.replace(/^www\./,'').toLowerCase()
    if(host==='youtu.be'){const id=url.pathname.split('/').filter(Boolean)[0];return valid(id)?id:null}
    if(host==='youtube.com'||host.endsWith('.youtube.com')){
      const id=url.searchParams.get('v')||(['live','shorts','embed'].includes(url.pathname.split('/').filter(Boolean)[0]||'')?url.pathname.split('/').filter(Boolean)[1]:null)
      return valid(id)?id:null
    }
  }catch{}
  return null
}
function valid(value:string|null|undefined):value is string{return !!value&&/^[A-Za-z0-9_-]{6,20}$/.test(value)}
