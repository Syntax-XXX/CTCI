import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { discordClientId, DISCORD_REDIRECT_URI, APP_URL } from '@/lib/discord'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth', APP_URL))

  let clientId: string
  try { clientId = discordClientId() }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }

  const state = randomBytes(32).toString('hex')
  const authorize = new URL('https://discord.com/oauth2/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI)
  authorize.searchParams.set('scope', 'identify guilds bot applications.commands')
  authorize.searchParams.set('permissions', '0')
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('prompt', 'consent')

  const response = NextResponse.redirect(authorize)
  response.cookies.set('ctci_discord_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
  return response
}
