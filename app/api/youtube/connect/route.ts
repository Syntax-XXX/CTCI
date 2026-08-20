import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getYouTubeClientId, YOUTUBE_REDIRECT_URI, YOUTUBE_SCOPES } from '@/lib/youtube'

export async function GET(){
  const sb=await createServerSupabase();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.redirect('/auth')
  let clientId:string;try{clientId=getYouTubeClientId()}catch(error){return NextResponse.json({error:(error as Error).message},{status:503})}
  const state=randomBytes(32).toString('hex')
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',YOUTUBE_REDIRECT_URI);url.searchParams.set('response_type','code');url.searchParams.set('scope',YOUTUBE_SCOPES.join(' '));url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('include_granted_scopes','true');url.searchParams.set('state',state)
  const response=NextResponse.redirect(url);response.cookies.set('ctci_youtube_state',state,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});return response
}
