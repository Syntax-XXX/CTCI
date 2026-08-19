import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getEventSubSecret } from '@/lib/twitch'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const messageId = request.headers.get('twitch-eventsub-message-id') || ''
  const timestamp = request.headers.get('twitch-eventsub-message-timestamp') || ''
  const signature = request.headers.get('twitch-eventsub-message-signature') || ''
  const messageType = request.headers.get('twitch-eventsub-message-type') || ''

  let secret: string
  try {
    secret = getEventSubSecret()
  } catch (error) {
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
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (messageType === 'webhook_callback_verification') {
    return new NextResponse(String(payload.challenge || ''), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  if (messageType === 'revocation') {
    console.warn('Twitch EventSub subscription revoked', payload.subscription)
    return new NextResponse(null, { status: 204 })
  }

  if (messageType !== 'notification' || payload.subscription?.type !== 'channel.chat.message') {
    return new NextResponse(null, { status: 204 })
  }

  const event = payload.event
  if (!event?.message_id || !event?.broadcaster_user_id || !event?.chatter_user_id) {
    return NextResponse.json({ error: 'Malformed chat event' }, { status: 400 })
  }

  try {
    const admin = createAdminSupabase()
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('twitch_user_id', event.broadcaster_user_id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return new NextResponse(null, { status: 204 })

    const { data: overlay, error: overlayError } = await admin
      .from('overlays')
      .select('id,enabled')
      .eq('user_id', profile.id)
      .maybeSingle()
    if (overlayError) throw overlayError
    if (!overlay?.enabled) return new NextResponse(null, { status: 204 })

    const { error: insertError } = await admin.from('chat_events').insert({
      id: event.message_id,
      overlay_id: overlay.id,
      broadcaster_user_id: event.broadcaster_user_id,
      broadcaster_login: String(event.broadcaster_user_login || '').toLowerCase(),
      chatter_user_id: event.chatter_user_id,
      chatter_login: String(event.chatter_user_login || '').toLowerCase(),
      chatter_name: event.chatter_user_name || event.chatter_user_login || 'unknown',
      message_text: event.message?.text || '',
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

function verifySignature(secret: string, id: string, timestamp: string, body: string, provided: string) {
  const expected = `sha256=${createHmac('sha256', secret).update(id + timestamp + body).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}
