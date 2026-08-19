import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getTwitchClientId, TWITCH_REDIRECT_URI, TWITCH_SCOPES } from '@/lib/twitch'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth', TWITCH_REDIRECT_URI))

  let clientId: string
  try {
    clientId = getTwitchClientId()
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  }

  const state = randomBytes(32).toString('hex')
  const authorize = new URL('https://id.twitch.tv/oauth2/authorize')
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', TWITCH_REDIRECT_URI)
  authorize.searchParams.set('scope', TWITCH_SCOPES.join(' '))
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('force_verify', 'true')

  const response = NextResponse.redirect(authorize)
  response.cookies.set('ctci_twitch_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
  return response
}
