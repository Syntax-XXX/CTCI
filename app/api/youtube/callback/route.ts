import { NextRequest,NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { exchangeYouTubeCode,getOwnYouTubeChannel } from '@/lib/youtube'

const APP=process.env.NEXT_PUBLIC_APP_URL||'https://chromachat.syntax-xxx.is-a.dev'
export async function GET(request:NextRequest){
  const state=request.nextUrl.searchParams.get('state'),expected=request.cookies.get('ctci_youtube_state')?.value,code=request.nextUrl.searchParams.get('code'),oauthError=request.nextUrl.searchParams.get('error')
  if(oauthError)return clear(NextResponse.redirect(new URL('/dashboard/chat?youtube=denied',APP)))
  if(!code||!state||!expected||state!==expected)return NextResponse.json({error:'Invalid YouTube OAuth state or missing code'},{status:400})
  try{
    const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();if(!user)return clear(NextResponse.redirect(new URL('/auth',APP)))
    const tokens=await exchangeYouTubeCode(code);const channel=await getOwnYouTubeChannel(tokens.access_token);const admin=createAdminSupabase()
    const existing=await admin.from('youtube_credentials').select('refresh_token').eq('user_id',user.id).maybeSingle();if(existing.error)throw existing.error
    const creds=await admin.from('youtube_credentials').upsert({user_id:user.id,access_token:tokens.access_token,refresh_token:tokens.refresh_token||existing.data?.refresh_token||null,expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),scopes:(tokens.scope||'').split(' ').filter(Boolean),channel_id:channel.id,channel_title:channel.title,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(creds.error)throw creds.error
    const overlay=await admin.from('overlays').update({youtube_auto_detect:true,youtube_channel_id:channel.id,youtube_channel_title:channel.title,show_youtube_chat:true,youtube_video_id:null,youtube_live_chat_id:null,youtube_next_page_token:null,youtube_next_poll_at:null,youtube_last_discovery_at:null}).eq('user_id',user.id);if(overlay.error)throw overlay.error
    return clear(NextResponse.redirect(new URL('/dashboard/chat?youtube=connected',APP)))
  }catch(error){console.error('YouTube OAuth callback failed',error);return clear(NextResponse.redirect(new URL('/dashboard/chat?youtube=error',APP)))}
}
function clear(response:NextResponse){response.cookies.set('ctci_youtube_state','',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});return response}
