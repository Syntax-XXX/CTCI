import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getEventSubSecret } from '@/lib/twitch'
import { executeCommand, parseCommand, type CommandPermission } from '@/lib/commands'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const messageId = request.headers.get('twitch-eventsub-message-id') || ''
  const timestamp = request.headers.get('twitch-eventsub-message-timestamp') || ''
  const signature = request.headers.get('twitch-eventsub-message-signature') || ''
  const messageType = request.headers.get('twitch-eventsub-message-type') || ''

  let secret: string
  try { secret = getEventSubSecret() } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'EventSub is not configured' }, { status: 503 })
  }

  if (!messageId || !timestamp || !signature || !verifySignature(secret, messageId, timestamp, body, signature)) {
    return NextResponse.json({ error: 'Invalid Twitch EventSub signature' }, { status: 403 })
  }

  const sentAt = Date.parse(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 10 * 60 * 1000) {
    return NextResponse.json({ error: 'Stale EventSub message' }, { status: 403 })
  }

  let payload: any
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (messageType === 'webhook_callback_verification') {
    return new NextResponse(String(payload.challenge || ''), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (messageType === 'revocation') {
    console.warn('Twitch EventSub subscription revoked', payload.subscription)
    return new NextResponse(null, { status: 204 })
  }
  if (messageType !== 'notification' || payload.subscription?.type !== 'channel.chat.message') return new NextResponse(null, { status: 204 })

  const event = payload.event
  if (!event?.message_id || !event?.broadcaster_user_id || !event?.chatter_user_id) {
    return NextResponse.json({ error: 'Malformed chat event' }, { status: 400 })
  }

  try {
    const admin = createAdminSupabase()
    const { data: profile, error: profileError } = await admin.from('profiles').select('id').eq('twitch_user_id', event.broadcaster_user_id).maybeSingle()
    if (profileError) throw profileError
    if (!profile) return new NextResponse(null, { status: 204 })

    const { data: overlay, error: overlayError } = await admin.from('overlays').select('id,enabled,command_prefix').eq('user_id', profile.id).maybeSingle()
    if (overlayError) throw overlayError
    if (!overlay?.enabled) return new NextResponse(null, { status: 204 })

    const text = String(event.message?.text || '')
    let parsed = null
    try { parsed = parseCommand(text, overlay.command_prefix || 'CC!') } catch (error) {
      await admin.from('command_audit_log').insert({
        owner_id: profile.id, channel_twitch_user_id: event.broadcaster_user_id, twitch_user_id: event.chatter_user_id,
        twitch_login: String(event.chatter_user_login || '').toLowerCase(), command_name: 'parse', raw_command: text.slice(0, 500),
        sanitized_args: [], source: 'core', success: false, error_code: error instanceof Error ? error.message : 'parse_error',
      })
      return new NextResponse(null, { status: 204 })
    }

    if (parsed) {
      const result = await executeCommand({
        admin,
        ownerId: profile.id,
        channelTwitchUserId: event.broadcaster_user_id,
        actor: {
          twitchUserId: event.chatter_user_id,
          login: String(event.chatter_user_login || '').toLowerCase(),
          roles: getRoles(event),
        },
        parsed,
      })
      if (result.handled) return new NextResponse(null, { status: 204 })
    }

    const { error: insertError } = await admin.from('chat_events').insert({
      id: event.message_id,
      overlay_id: overlay.id,
      broadcaster_user_id: event.broadcaster_user_id,
      broadcaster_login: String(event.broadcaster_user_login || '').toLowerCase(),
      chatter_user_id: event.chatter_user_id,
      chatter_login: String(event.chatter_user_login || '').toLowerCase(),
      chatter_name: event.chatter_user_name || event.chatter_user_login || 'unknown',
      message_text: text,
      color: event.color || null,
      badges: event.badges || [],
      fragments: event.message?.fragments || [],
      reply: event.reply || null,
      created_at: timestamp,
    })
    if (insertError && insertError.code !== '23505') throw insertError
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('EventSub chat ingestion failed', error)
    return NextResponse.json({ error: 'Failed to ingest event' }, { status: 500 })
  }
}

function getRoles(event: any) {
  const roles = new Set<CommandPermission>(['viewer'])
  if (event.chatter_user_id === event.broadcaster_user_id) roles.add('broadcaster')
  for (const badge of Array.isArray(event.badges) ? event.badges : []) {
    const id = String(badge?.set_id || badge?.id || '').toLowerCase()
    if (id === 'moderator') roles.add('moderator')
    if (id === 'vip') roles.add('vip')
    if (id === 'subscriber' || id === 'founder') roles.add('subscriber')
  }
  return roles
}

function verifySignature(secret: string, id: string, timestamp: string, body: string, provided: string) {
  const expected = `sha256=${createHmac('sha256', secret).update(id + timestamp + body).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}
