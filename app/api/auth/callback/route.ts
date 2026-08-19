import { randomBytes } from 'crypto'
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
    return clearState(NextResponse.redirect(new URL('/auth?twitch=denied', APP_URL)))
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: 'Invalid Twitch OAuth state or missing authorization code' }, { status: 400 })
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    const twitch = await getTwitchUser(tokens.access_token)
    const admin = createAdminSupabase()
    const supabase = await createServerSupabase()

    const { data: { user: currentUser } } = await supabase.auth.getUser()
    let userId = currentUser?.id || null

    if (userId) {
      const { data: alreadyLinked } = await admin
        .from('profiles')
        .select('id')
        .eq('twitch_user_id', twitch.id)
        .neq('id', userId)
        .maybeSingle()
      if (alreadyLinked) throw new Error('This Twitch account is already linked to another CTCI account')
    } else {
      const { data: existingProfile, error: findError } = await admin
        .from('profiles')
        .select('id')
        .eq('twitch_user_id', twitch.id)
        .maybeSingle()
      if (findError) throw findError

      let authEmail: string
      if (existingProfile) {
        userId = existingProfile.id
        const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(userId)
        if (authLookupError) throw authLookupError
        if (!authUser.user?.email) throw new Error('Existing CTCI Twitch user has no Supabase auth email')
        authEmail = authUser.user.email
      } else {
        authEmail = `twitch-${twitch.id}@auth.chromachat.syntax-xxx.is-a.dev`
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: authEmail,
          password: randomBytes(32).toString('hex'),
          email_confirm: true,
          user_metadata: {
            display_name: twitch.display_name,
            avatar_url: twitch.profile_image_url,
            twitch_login: twitch.login,
          },
          app_metadata: {
            login_provider: 'twitch',
            twitch_user_id: twitch.id,
          },
        })
        if (createError || !created.user) throw createError || new Error('Failed to create CTCI user')
        userId = created.user.id
      }

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: authEmail,
      })
      if (linkError) throw linkError
      const tokenHash = link.properties?.hashed_token
      if (!tokenHash) throw new Error('Supabase did not return a login token hash')

      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      })
      if (sessionError) throw sessionError
    }

    if (!userId) throw new Error('Unable to resolve CTCI user')

    const { error: credentialError } = await admin.from('twitch_credentials').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope,
    }, { onConflict: 'user_id' })
    if (credentialError) throw credentialError

    const { error: profileError } = await admin.from('profiles').update({
      twitch_user_id: twitch.id,
      twitch_login: twitch.login.toLowerCase(),
      display_name: twitch.display_name,
      avatar_url: twitch.profile_image_url,
    }).eq('id', userId)
    if (profileError) throw profileError

    const { error: overlayError } = await admin.from('overlays').update({
      channel_login: twitch.login.toLowerCase(),
    }).eq('user_id', userId)
    if (overlayError) throw overlayError

    try {
      await createChatSubscription(twitch.id)
      destination.searchParams.set('twitch', 'connected')
    } catch (subscriptionError) {
      console.error('Twitch login succeeded but EventSub setup failed', subscriptionError)
      destination.searchParams.set('twitch', 'connected-no-eventsub')
    }

    return clearState(NextResponse.redirect(destination))
  } catch (error) {
    console.error('Twitch OAuth callback failed', error)
    const failed = new URL('/auth', APP_URL)
    failed.searchParams.set('twitch', 'error')
    return clearState(NextResponse.redirect(failed))
  }
}

function clearState(response: NextResponse) {
  response.cookies.set('ctci_twitch_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}
