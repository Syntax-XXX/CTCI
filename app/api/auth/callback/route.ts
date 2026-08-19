import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { APP_URL, createChatSubscription, exchangeCodeForTokens, getTwitchUser } from '@/lib/twitch'

export async function GET(request: NextRequest) {
  const destination = new URL('/dashboard', APP_URL)
  const state = request.nextUrl.searchParams.get('state')
  const expectedState = request.cookies.get('ctci_twitch_state')?.value
  const code = request.nextUrl.searchParams.get('code')
  const oauthError = request.nextUrl.searchParams.get('error')

  if (oauthError) {
    destination.searchParams.set('twitch', 'denied')
    return clearState(NextResponse.redirect(destination))
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: 'Invalid Twitch OAuth state or missing authorization code' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.redirect(new URL('/auth', APP_URL))

  try {
    const tokens = await exchangeCodeForTokens(code)
    const twitch = await getTwitchUser(tokens.access_token)
    const admin = createAdminSupabase()

    const { error: credentialError } = await admin.from('twitch_credentials').upsert({
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope,
    }, { onConflict: 'user_id' })
    if (credentialError) throw credentialError

    const { error: profileError } = await supabase.from('profiles').update({
      twitch_user_id: twitch.id,
      twitch_login: twitch.login.toLowerCase(),
      display_name: twitch.display_name,
      avatar_url: twitch.profile_image_url,
    }).eq('id', user.id)
    if (profileError) throw profileError

    const { error: overlayError } = await supabase.from('overlays').update({
      channel_login: twitch.login.toLowerCase(),
    }).eq('user_id', user.id)
    if (overlayError) throw overlayError

    try {
      await createChatSubscription(twitch.id)
      destination.searchParams.set('twitch', 'connected')
    } catch (subscriptionError) {
      console.error('Twitch connected but EventSub setup failed', subscriptionError)
      destination.searchParams.set('twitch', 'connected-no-eventsub')
    }

    return clearState(NextResponse.redirect(destination))
  } catch (error) {
    console.error('Twitch OAuth callback failed', error)
    destination.searchParams.set('twitch', 'error')
    return clearState(NextResponse.redirect(destination))
  }
}

function clearState(response: NextResponse) {
  response.cookies.set('ctci_twitch_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}
