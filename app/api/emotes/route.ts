import { NextRequest,NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { featureFlags } from '@/lib/features'

export const runtime='nodejs'
export const dynamic='force-dynamic'
type Emote={code:string;url:string;provider:'7tv'|'bttv'|'ffz'}

export async function GET(request:NextRequest){
  const slug=String(request.nextUrl.searchParams.get('slug')||'').trim()
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(slug))return NextResponse.json({error:'Invalid overlay slug'},{status:400})
  const admin=createAdminSupabase()
  try{
    const ownerId=await resolveOwner(admin,slug);if(!ownerId)return NextResponse.json({emotes:[],providers:{},warnings:['Overlay not found']},{status:404})
    const flags=await featureFlags(admin,ownerId),profile=await admin.from('profiles').select('twitch_user_id').eq('id',ownerId).single();if(profile.error)throw profile.error
    const twitchId=String(profile.data.twitch_user_id||''),jobs:Promise<{provider:string;emotes:Emote[];warning?:string}>[]=[]
    if(flags.bttv)jobs.push(loadBttv(twitchId))
    if(flags.ffz)jobs.push(loadFfz(twitchId))
    if(flags.seventv)jobs.push(loadSevenTv(twitchId))
    const results=await Promise.all(jobs),map=new Map<string,Emote>(),warnings:string[]=[],providers:Record<string,number>={}
    for(const result of results){providers[result.provider]=result.emotes.length;if(result.warning)warnings.push(result.warning);for(const emote of result.emotes)if(!map.has(emote.code))map.set(emote.code,emote)}
    return NextResponse.json({emotes:[...map.values()].slice(0,5000),providers,warnings},{headers:{'Cache-Control':'public, max-age=120, stale-while-revalidate=300'}})
  }catch(error){console.error('External emote aggregation failed',error);return NextResponse.json({error:'Failed to load external emotes'},{status:500})}
}

async function loadBttv(twitchId:string){const emotes:Emote[]=[];try{const[global,user]=await Promise.all([json('https://api.betterttv.net/3/cached/emotes/global'),twitchId?json(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchId)}`).catch(()=>null):Promise.resolve(null)]);for(const e of[...(Array.isArray(global)?global:[]),...(user?.channelEmotes||[]),...(user?.sharedEmotes||[])])if(e?.id&&e?.code)emotes.push({code:String(e.code),url:`https://cdn.betterttv.net/emote/${encodeURIComponent(String(e.id))}/3x`,provider:'bttv'});return{provider:'bttv',emotes}}catch(error:any){return{provider:'bttv',emotes,warning:`BTTV: ${String(error?.message||'unavailable').slice(0,100)}`}}}
async function loadFfz(twitchId:string){const emotes:Emote[]=[];try{const[global,room]=await Promise.all([json('https://api.frankerfacez.com/v1/set/global'),twitchId?json(`https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(twitchId)}`).catch(()=>null):Promise.resolve(null)]);for(const source of[global?.sets||{},room?.sets||{}])for(const set of Object.values(source) as any[])for(const e of set?.emoticons||[])if(e?.id&&e?.name){const urls=e.urls||{};const raw=urls['4']||urls['2']||urls['1']||`//cdn.frankerfacez.com/emoticon/${e.id}/4`;emotes.push({code:String(e.name),url:String(raw).startsWith('//')?`https:${raw}`:String(raw),provider:'ffz'})}return{provider:'ffz',emotes}}catch(error:any){return{provider:'ffz',emotes,warning:`FFZ: ${String(error?.message||'unavailable').slice(0,100)}`}}}
async function loadSevenTv(twitchId:string){const emotes:Emote[]=[];try{const global=await json('https://7tv.io/v3/emote-sets/global').catch(()=>null);let user:any=null,set:any=null;if(twitchId){user=await json(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`).catch(()=>null);const setId=user?.emote_set?.id||user?.emote_sets?.[0]?.id;if(setId)set=await json(`https://api.7tv.app/v3/emote-sets/${encodeURIComponent(String(setId))}`).catch(()=>null)}for(const e of[...(global?.emotes||[]),...(set?.emotes||user?.emote_set?.emotes||[])]){const id=e?.id||e?.data?.id,name=e?.name||e?.data?.name;if(id&&name)emotes.push({code:String(name),url:`https://cdn.7tv.app/emote/${encodeURIComponent(String(id))}/3x.webp`,provider:'7tv'})}return{provider:'7tv',emotes}}catch(error:any){return{provider:'7tv',emotes,warning:`7TV: ${String(error?.message||'unavailable').slice(0,100)}`}}}
async function json(url:string){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'CTCI/0.3'},cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error(`${r.status}`);return await r.json()}finally{clearTimeout(timer)}}
async function resolveOwner(admin:any,slug:string){const p=await admin.from('overlays').select('user_id').eq('slug',slug).eq('enabled',true).maybeSingle();if(p.error)throw p.error;if(p.data)return p.data.user_id;const i=await admin.from('overlay_instances').select('owner_id').eq('slug',slug).eq('enabled',true).maybeSingle();if(i.error)throw i.error;return i.data?.owner_id||null}
