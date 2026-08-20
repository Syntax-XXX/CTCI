import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const runtime='nodejs'

export async function GET(){
  const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const admin=createAdminSupabase()
  const[o,c]=await Promise.all([
    admin.from('overlays').select('show_twitch_chat,show_youtube_chat,youtube_auto_detect,youtube_video_id,youtube_channel_id,youtube_channel_title,youtube_active_title,youtube_last_sync_at,youtube_last_discovery_at').eq('user_id',user.id).single(),
    admin.from('youtube_credentials').select('channel_id,channel_title,expires_at').eq('user_id',user.id).maybeSingle(),
  ])
  if(o.error)return NextResponse.json({error:o.error.message},{status:500})
  return NextResponse.json({...o.data,youtube_connected:!!c.data?.channel_id,youtube_oauth_channel_id:c.data?.channel_id||null,youtube_oauth_channel_title:c.data?.channel_title||null})
}

export async function PATCH(request:NextRequest){
  const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json() as {showTwitch?:boolean;showYouTube?:boolean;youtube?:string;autoDetect?:boolean}
    const showTwitch=body.showTwitch===true,showYouTube=body.showYouTube===true,autoDetect=body.autoDetect!==false
    if(!showTwitch&&!showYouTube)return NextResponse.json({error:'Keep at least Twitch or YouTube enabled.'},{status:400})
    const admin=createAdminSupabase();const creds=await admin.from('youtube_credentials').select('channel_id,channel_title').eq('user_id',user.id).maybeSingle();if(creds.error)throw creds.error
    if(showYouTube&&autoDetect&&!creds.data?.channel_id)return NextResponse.json({error:'Connect your YouTube channel first for automatic stream detection.'},{status:400})
    const videoId=showYouTube&&!autoDetect?parseYouTubeVideoId(String(body.youtube||'')):null
    if(showYouTube&&!autoDetect&&!videoId)return NextResponse.json({error:'Enter a valid YouTube livestream URL or video ID.'},{status:400})
    const{data:overlay,error:readError}=await admin.from('overlays').select('id,youtube_video_id,youtube_auto_detect').eq('user_id',user.id).single();if(readError)throw readError
    const changed=String(overlay.youtube_video_id||'')!==String(videoId||'')||overlay.youtube_auto_detect!==autoDetect
    const update:any={show_twitch_chat:showTwitch,show_youtube_chat:showYouTube,youtube_auto_detect:autoDetect,youtube_video_id:videoId,youtube_channel_id:creds.data?.channel_id||null,youtube_channel_title:creds.data?.channel_title||null}
    if(changed||!showYouTube){update.youtube_live_chat_id=null;update.youtube_next_page_token=null;update.youtube_next_poll_at=null;update.youtube_last_sync_at=null;update.youtube_active_title=null;update.youtube_last_discovery_at=null}
    const{error:updateError}=await admin.from('overlays').update(update).eq('id',overlay.id);if(updateError)throw updateError
    if(!showTwitch){const{error}=await admin.from('chat_events').delete().eq('overlay_id',overlay.id).eq('source','twitch');if(error)throw error}
    if(!showYouTube){const{error}=await admin.from('chat_events').delete().eq('overlay_id',overlay.id).eq('source','youtube');if(error)throw error}
    return NextResponse.json({ok:true,showTwitch,showYouTube,autoDetect,youtubeVideoId:videoId})
  }catch(error){console.error('Chat source update failed',error);return NextResponse.json({error:'Failed to update chat sources'},{status:500})}
}
function parseYouTubeVideoId(value:string){const raw=value.trim();if(/^[A-Za-z0-9_-]{6,20}$/.test(raw))return raw;try{const url=new URL(raw),host=url.hostname.replace(/^www\./,'').toLowerCase();if(host==='youtu.be'){const id=url.pathname.split('/').filter(Boolean)[0];return valid(id)?id:null}if(host==='youtube.com'||host.endsWith('.youtube.com')){const parts=url.pathname.split('/').filter(Boolean),id=url.searchParams.get('v')||(['live','shorts','embed'].includes(parts[0]||'')?parts[1]:null);return valid(id)?id:null}}catch{}return null}
function valid(value:string|null|undefined):value is string{return !!value&&/^[A-Za-z0-9_-]{6,20}$/.test(value)}
