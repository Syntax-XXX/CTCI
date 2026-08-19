import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getEventSubSecret, getValidTwitchUserToken, sendTwitchChatMessage } from '@/lib/twitch'
import { sendDiscordChatEmbed } from '@/lib/discord'
import { executeCommand, listCommands, parseCommand, type CommandPermission } from '@/lib/commands'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const messageId = request.headers.get('twitch-eventsub-message-id') || ''
  const timestamp = request.headers.get('twitch-eventsub-message-timestamp') || ''
  const signature = request.headers.get('twitch-eventsub-message-signature') || ''
  const messageType = request.headers.get('twitch-eventsub-message-type') || ''
  let secret: string
  try { secret = getEventSubSecret() } catch (error) { console.error(error); return NextResponse.json({ error: 'EventSub is not configured' }, { status: 503 }) }
  if (!messageId || !timestamp || !signature || !verifySignature(secret, messageId, timestamp, body, signature)) return NextResponse.json({ error: 'Invalid Twitch EventSub signature' }, { status: 403 })
  const sentAt = Date.parse(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 10 * 60 * 1000) return NextResponse.json({ error: 'Stale EventSub message' }, { status: 403 })
  let payload: any
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (messageType === 'webhook_callback_verification') return new NextResponse(String(payload.challenge || ''), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  if (messageType === 'revocation') { console.warn('Twitch EventSub subscription revoked', payload.subscription); return new NextResponse(null, { status: 204 }) }
  if (messageType !== 'notification' || payload.subscription?.type !== 'channel.chat.message') return new NextResponse(null, { status: 204 })
  const event = payload.event
  if (!event?.message_id || !event?.broadcaster_user_id || !event?.chatter_user_id) return NextResponse.json({ error: 'Malformed chat event' }, { status: 400 })

  const admin = createAdminSupabase()
  let claimed = false
  try {
    const claim = await admin.from('eventsub_receipts').insert({message_id:messageId})
    if (claim.error?.code === '23505') return new NextResponse(null, { status: 204 })
    if (claim.error) throw claim.error
    claimed = true
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const cleanup = await admin.from('eventsub_receipts').delete().lt('received_at', cutoff)
      if (cleanup.error) console.warn('EventSub receipt cleanup failed', cleanup.error)
    }

    const { data: profile, error: profileError } = await admin.from('profiles').select('id').eq('twitch_user_id', event.broadcaster_user_id).maybeSingle()
    if (profileError) throw profileError
    if (!profile) return new NextResponse(null, { status: 204 })
    const { data: overlay, error: overlayError } = await admin.from('overlays').select('id,enabled,command_prefix').eq('user_id', profile.id).maybeSingle()
    if (overlayError) throw overlayError
    if (!overlay?.enabled) return new NextResponse(null, { status: 204 })
    const text = String(event.message?.text || '')
    let parsed = null
    try { parsed = parseCommand(text, overlay.command_prefix || 'CC!') } catch (error) {
      await admin.from('command_audit_log').insert({owner_id:profile.id,channel_twitch_user_id:event.broadcaster_user_id,twitch_user_id:event.chatter_user_id,twitch_login:String(event.chatter_user_login||'').toLowerCase(),command_name:'parse',raw_command:text.slice(0,500),sanitized_args:[],source:'core',success:false,error_code:error instanceof Error?error.message:'parse_error'})
      return new NextResponse(null, { status: 204 })
    }
    if (parsed) {
      const result = await executeCommand({admin,ownerId:profile.id,channelTwitchUserId:event.broadcaster_user_id,actor:{twitchUserId:event.chatter_user_id,login:String(event.chatter_user_login||'').toLowerCase(),roles:getRoles(event)},parsed})
      if (result.handled) {
        let response:string|undefined = result.success && 'message' in result && typeof result.message==='string' ? result.message : undefined
        if (result.success && parsed.command === 'help') response = await buildHelpMessage(admin, profile.id, overlay.command_prefix || 'CC!', parsed.args[0])
        if (response) await replyInTwitch(admin, profile.id, event.broadcaster_user_id, event.message_id, response)
        await mirrorToDiscord(admin, profile.id, event, text, true, timestamp)
        return new NextResponse(null, { status: 204 })
      }
    }
    const { error: insertError } = await admin.from('chat_events').insert({id:event.message_id,overlay_id:overlay.id,broadcaster_user_id:event.broadcaster_user_id,broadcaster_login:String(event.broadcaster_user_login||'').toLowerCase(),chatter_user_id:event.chatter_user_id,chatter_login:String(event.chatter_user_login||'').toLowerCase(),chatter_name:event.chatter_user_name||event.chatter_user_login||'unknown',message_text:text,color:event.color||null,badges:event.badges||[],fragments:event.message?.fragments||[],reply:event.reply||null,created_at:timestamp})
    if (insertError && insertError.code !== '23505') throw insertError
    if (!insertError) await mirrorToDiscord(admin, profile.id, event, text, false, timestamp)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (claimed) {
      const release = await admin.from('eventsub_receipts').delete().eq('message_id', messageId)
      if (release.error) console.error('Failed to release EventSub receipt after error', release.error)
    }
    console.error('EventSub chat ingestion failed', error)
    return NextResponse.json({ error: 'Failed to ingest event' }, { status: 500 })
  }
}

async function replyInTwitch(admin:any,ownerId:string,broadcasterId:string,parentMessageId:string,message:string){
  try{
    const creds=await getValidTwitchUserToken(admin,ownerId)
    if(!creds?.access_token)return
    const scopes=Array.isArray(creds.scopes)?creds.scopes:[]
    if(!scopes.includes('user:write:chat')){console.warn('Twitch command reply skipped: reconnect Twitch to grant user:write:chat');return}
    await sendTwitchChatMessage({accessToken:creds.access_token,broadcasterId,senderId:broadcasterId,message,replyParentMessageId:parentMessageId})
  }catch(error){console.error('Twitch command reply failed',error)}
}
async function buildHelpMessage(admin:any,ownerId:string,prefix:string,arg?:string){const commands=listCommands();const{data:rows}=await admin.from('command_configurations').select('command_name,enabled,aliases,permissions').eq('owner_id',ownerId);const configs=new Map<string,any>((rows||[]).map((r:any)=>[String(r.command_name).toLowerCase(),r]));const active=commands.filter(c=>configs.get(c.name)?.enabled!==false),q=(arg||'').toLowerCase();if(q&&!/^\d+$/.test(q)){const found=active.find(c=>c.name===q||c.aliases?.includes(q)||(configs.get(c.name)?.aliases||[]).includes(q));if(!found)return`Unknown command. Try ${prefix}help`;const cfg=configs.get(found.name),roles=(cfg?.permissions?.length?cfg.permissions:found.permissions).join(', '),aliases=[...(found.aliases||[]),...(cfg?.aliases||[])].filter((v,i,a)=>a.indexOf(v)===i);return`${prefix}${found.name} — ${found.description} · roles: ${roles}${aliases.length?` · aliases: ${aliases.join(', ')}`:''}`.slice(0,500)}const perPage=10,total=Math.max(1,Math.ceil(active.length/perPage)),page=Math.min(total,Math.max(1,Number(q||1)||1)),slice=active.slice((page-1)*perPage,page*perPage);return`Commands ${page}/${total}: ${slice.map(c=>prefix+c.name).join(', ')}${page<total?` · ${prefix}help ${page+1}`:''}`.slice(0,500)}
async function mirrorToDiscord(admin:any,ownerId:string,event:any,text:string,isCommand:boolean,timestamp:string){try{const{data:sync}=await admin.from('discord_chat_sync').select('channel_id,enabled,include_commands').eq('owner_id',ownerId).maybeSingle();if(!sync?.enabled||!sync.channel_id||(isCommand&&!sync.include_commands))return;await sendDiscordChatEmbed({channelId:sync.channel_id,chatterName:String(event.chatter_user_name||event.chatter_user_login||'unknown'),chatterLogin:String(event.chatter_user_login||'unknown'),message:text,broadcasterLogin:String(event.broadcaster_user_login||''),isCommand,timestamp,color:typeof event.color==='string'?event.color:null})}catch(error){console.error('Discord chat mirror failed',error)}}
function getRoles(event:any){const roles=new Set<CommandPermission>(['viewer']);if(event.chatter_user_id===event.broadcaster_user_id)roles.add('broadcaster');for(const badge of Array.isArray(event.badges)?event.badges:[]){const id=String(badge?.set_id||badge?.id||'').toLowerCase();if(id==='moderator')roles.add('moderator');if(id==='vip')roles.add('vip');if(id==='subscriber'||id==='founder')roles.add('subscriber')}return roles}
function verifySignature(secret:string,id:string,timestamp:string,body:string,provided:string){const expected=`sha256=${createHmac('sha256',secret).update(id+timestamp+body).digest('hex')}`,a=Buffer.from(expected),b=Buffer.from(provided);return a.length===b.length&&timingSafeEqual(a,b)}
