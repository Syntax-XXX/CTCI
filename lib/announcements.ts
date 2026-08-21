import { getValidTwitchUserToken,sendTwitchChatMessage } from '@/lib/twitch'
import { getValidYouTubeToken,sendYouTubeChatMessage } from '@/lib/youtube'

export async function sendAnnouncement(admin:any,ownerId:string,message:string){
  const text=String(message||'').trim().slice(0,200)
  if(!text)throw new Error('message_required')
  const[profile,overlay]=await Promise.all([
    admin.from('profiles').select('twitch_user_id,twitch_login').eq('id',ownerId).single(),
    admin.from('overlays').select('show_twitch_chat,show_youtube_chat,youtube_live_chat_id').eq('user_id',ownerId).single(),
  ])
  if(profile.error)throw profile.error;if(overlay.error)throw overlay.error
  const results:{twitch?:string;youtube?:string}={}
  if(overlay.data.show_twitch_chat&&profile.data.twitch_user_id){
    try{const creds=await getValidTwitchUserToken(admin,ownerId);if(!creds?.access_token)throw new Error('Twitch not connected');await sendTwitchChatMessage({accessToken:creds.access_token,broadcasterId:String(profile.data.twitch_user_id),senderId:String(profile.data.twitch_user_id),message:text});results.twitch='sent'}catch(error:any){results.twitch=`error: ${String(error?.message||error).slice(0,120)}`}
  }
  if(overlay.data.show_youtube_chat&&overlay.data.youtube_live_chat_id){
    try{const creds=await getValidYouTubeToken(admin,ownerId);if(!creds?.access_token)throw new Error('YouTube not connected');await sendYouTubeChatMessage(creds.access_token,String(overlay.data.youtube_live_chat_id),text);results.youtube='sent'}catch(error:any){results.youtube=`error: ${String(error?.message||error).slice(0,120)}`}
  }
  await admin.from('audit_events').insert({owner_id:ownerId,actor_user_id:ownerId,action:'announcement.send',target_type:'chat',target_id:null,metadata:{results,text_length:text.length}})
  return results
}
