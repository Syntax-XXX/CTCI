'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { PluginOverlaySurface } from '@/components/PluginSurface'
import { createClient } from '@/lib/supabase/client'

type Overlay = {
  id:string; user_id:string; slug:string; channel_login:string|null;
  font_family:string; username_font_family:string; font_size:number; username_font_size:number; font_weight:number; message_spacing:number;
  username_color:string; message_color:string; background_color:string; background_opacity:number;
  bubble_color:string; bubble_opacity:number; border_radius:number;
  show_usernames:boolean; show_timestamps:boolean; show_emotes:boolean;
  animation:string; direction:string; custom_css:string; max_messages:number; fade_seconds:number;
  theme:string; density:string; rainbow_mode:string; glow_enabled:boolean; glow_color:string; role_styles:Record<string,any>;
}

type ChatterStyle = {
  chatter_login:string; nickname:string|null; username_color:string|null; message_color:string|null;
  font_family:string|null; font_size:number|null; font_weight:number|null; highlight:boolean; hidden:boolean;
  icon:string|null; glow_color:string|null;
}

type Fragment = { type:string; text:string; emote?:{id:string}|null }
type EventRow = { id:string; chatter_login:string; chatter_name:string; message_text:string; color:string|null; badges:any[]; fragments:Fragment[]; created_at:string }
type Message = { id:string; user:string; name:string; text:string; color?:string|null; time:Date; fragments:Fragment[]; badges:any[] }
type Badge = { id:string; slug:string; name:string; icon_text:string|null; icon_url:string|null; color:string; owner_id:string|null }
type BadgeAssignment = { badge_id:string; twitch_login:string; owner_id:string|null }
type Viewport = { width:number; height:number; scale:number }

const OVERLAY_RESET_CSS = `
html,body,#__next{margin:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;background:transparent!important;background-image:none!important;overflow:hidden!important}
html{font-size:100%!important}
body:before{display:none!important;content:none!important}
*,*:before,*:after{box-sizing:border-box}
.overlay-root{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;width:100dvw!important;height:100dvh!important;max-width:100%!important;max-height:100%!important;min-width:0!important;min-height:0!important;background:transparent!important;background-image:none!important;overflow:hidden!important;padding:var(--ctci-safe,8px)!important;contain:layout paint}
.overlay-root .chat-message{max-width:100%!important;min-width:0!important;overflow-wrap:anywhere!important;word-break:break-word!important;white-space:normal!important;line-height:1.3!important;flex:0 0 auto!important}
.overlay-root .chat-message strong,.overlay-root .timestamp{max-width:100%;overflow-wrap:anywhere;word-break:break-word}
.overlay-root .chat-emote{display:inline-block!important;width:auto!important;height:auto!important;max-width:min(2.5em,18vw)!important;max-height:1.45em!important;object-fit:contain!important;vertical-align:middle!important}
.overlay-root .custom-badge{display:inline-flex!important;max-width:min(14em,45vw)!important;min-width:0!important;vertical-align:middle!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:.72em!important;line-height:1.15!important}
.overlay-root .custom-badge img{display:block!important;width:auto!important;height:auto!important;max-width:2.2em!important;max-height:1.15em!important;object-fit:contain!important}
.overlay-root .plugin-overlay-layer{max-width:100vw!important;max-height:100vh!important;overflow:hidden!important}
@media (max-width:480px),(max-height:270px){.overlay-root .chat-message{line-height:1.2!important}.overlay-root .custom-badge{font-size:.64em!important}}
`

export default function OverlayPage(){
  const params=useParams<{slug:string}>()
  const supabase=useMemo(()=>createClient(),[])
  const[overlay,setOverlay]=useState<Overlay|null>(null)
  const[styles,setStyles]=useState<Record<string,ChatterStyle>>({})
  const[messages,setMessages]=useState<Message[]>([])
  const[fontCss,setFontCss]=useState('')
  const[badges,setBadges]=useState<Record<string,Badge[]>>({})
  const[error,setError]=useState('')
  const[clock,setClock]=useState(Date.now())
  const[viewport,setViewport]=useState<Viewport>({width:1920,height:1080,scale:1})
  const reconnectTimer=useRef<number|null>(null)

  useEffect(()=>{
    document.documentElement.style.background='transparent'
    document.body.style.background='transparent'
    document.body.style.backgroundImage='none'
    return()=>{
      document.documentElement.style.removeProperty('background')
      document.body.style.removeProperty('background')
      document.body.style.removeProperty('background-image')
    }
  },[])

  useEffect(()=>{
    let frame=0
    const measure=()=>{
      frame=0
      const width=Math.max(1,window.innerWidth||document.documentElement.clientWidth||1920)
      const height=Math.max(1,window.innerHeight||document.documentElement.clientHeight||1080)
      const natural=Math.min(width/1920,height/1080)
      setViewport({width,height,scale:clamp(natural,.5,2.5)})
    }
    const schedule=()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
    measure()
    window.addEventListener('resize',schedule,{passive:true})
    window.visualViewport?.addEventListener('resize',schedule,{passive:true})
    return()=>{if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule)}
  },[])

  useEffect(()=>{
    let disposed=false
    let channel:any=null

    async function start(){
      if(disposed)return
      if(channel){await supabase.removeChannel(channel);channel=null}

      const{data,error}=await supabase.from('overlays').select('*').eq('slug',params.slug).eq('enabled',true).single()
      if(error||!data){setError('Overlay not found or disabled');return}

      const current=data as Overlay
      setError('')
      setOverlay(current)
      await loadExtras(current.user_id,current.id,current.max_messages)
      if(disposed)return

      channel=supabase.channel(`ctci-overlay-${current.id}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_events',filter:`overlay_id=eq.${current.id}`},payload=>{
          const next=toMessage(payload.new as EventRow)
          setMessages(existing=>{
            if(existing.some(message=>message.id===next.id))return existing
            return[...existing,next].slice(-100)
          })
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'overlays',filter:`id=eq.${current.id}`},payload=>setOverlay(payload.new as Overlay))
        .on('postgres_changes',{event:'*',schema:'public',table:'chatter_styles',filter:`owner_id=eq.${current.user_id}`},()=>refreshStyles(current.user_id))
        .on('postgres_changes',{event:'*',schema:'public',table:'badge_assignments'},()=>refreshBadges(current.user_id))
        .on('postgres_changes',{event:'*',schema:'public',table:'badge_definitions'},()=>refreshBadges(current.user_id))
        .subscribe(status=>{
          if(disposed)return
          if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
            if(reconnectTimer.current)window.clearTimeout(reconnectTimer.current)
            reconnectTimer.current=window.setTimeout(()=>{void start()},1500)
          }
        })
    }

    void start()
    return()=>{
      disposed=true
      if(reconnectTimer.current)window.clearTimeout(reconnectTimer.current)
      if(channel)void supabase.removeChannel(channel)
    }
  },[params.slug,supabase])

  useEffect(()=>{
    if(!overlay?.fade_seconds)return
    const timer=window.setInterval(()=>setClock(Date.now()),1000)
    return()=>window.clearInterval(timer)
  },[overlay?.fade_seconds])

  async function loadExtras(userId:string,overlayId:string,max:number){
    const[styleRes,fontRes,eventRes]=await Promise.all([
      supabase.from('chatter_styles').select('*').eq('owner_id',userId),
      supabase.from('font_assets').select('label,storage_path').eq('owner_id',userId),
      supabase.from('chat_events').select('id,chatter_login,chatter_name,message_text,color,badges,fragments,created_at').eq('overlay_id',overlayId).order('created_at',{ascending:false}).limit(max),
    ])
    const styleMap:Record<string,ChatterStyle>={}
    ;(styleRes.data||[]).forEach((row:any)=>{styleMap[String(row.chatter_login).toLowerCase()]=row as ChatterStyle})
    setStyles(styleMap)
    setFontCss((fontRes.data||[]).map((font:any)=>{
      const url=supabase.storage.from('ctci-fonts').getPublicUrl(font.storage_path).data.publicUrl
      return `@font-face{font-family:${JSON.stringify(font.label)};src:url(${JSON.stringify(url)});font-display:swap}`
    }).join('\n'))
    setMessages(((eventRes.data||[]) as EventRow[]).reverse().map(toMessage))
    await refreshBadges(userId)
  }

  async function refreshStyles(userId:string){
    const result=await supabase.from('chatter_styles').select('*').eq('owner_id',userId)
    const map:Record<string,ChatterStyle>={}
    ;(result.data||[]).forEach((row:any)=>{map[String(row.chatter_login).toLowerCase()]=row as ChatterStyle})
    setStyles(map)
  }

  async function refreshBadges(userId:string){
    const[definitions,assignments]=await Promise.all([
      supabase.from('badge_definitions').select('id,slug,name,icon_text,icon_url,color,owner_id').eq('enabled',true),
      supabase.from('badge_assignments').select('badge_id,twitch_login,owner_id'),
    ])
    const definitionMap=new Map<string,Badge>()
    for(const row of definitions.data||[]){
      const badge=row as Badge
      if(badge.owner_id===null||badge.owner_id===userId)definitionMap.set(badge.id,badge)
    }
    const map:Record<string,Badge[]>={}
    for(const row of(assignments.data||[]) as BadgeAssignment[]){
      if(row.owner_id!==null&&row.owner_id!==userId)continue
      const badge=definitionMap.get(row.badge_id)
      if(!badge)continue
      const login=row.twitch_login.toLowerCase()
      ;(map[login]??=[]).push(badge)
    }
    setBadges(map)
  }

  if(error)return <div className="overlay-root"><style>{OVERLAY_RESET_CSS}</style><div className="msg danger">{error}</div></div>
  if(!overlay)return <div className="overlay-root"><style>{OVERLAY_RESET_CSS}</style></div>

  const scale=viewport.scale
  const safe=clamp(Math.round(14*scale),4,48)
  const baseFont=clamp(overlay.font_size*scale,10,192)
  const usernameFont=clamp(overlay.username_font_size*scale,9,192)
  const spacing=clamp(overlay.message_spacing*scale,0,96)
  const radius=clamp(overlay.border_radius*scale,0,96)
  const estimatedRow=Math.max(18,baseFont*1.55+spacing)
  const availableHeight=Math.max(estimatedRow,viewport.height-safe*2)
  const responsiveMax=Math.max(1,Math.floor(availableHeight/estimatedRow))
  const visibleLimit=Math.max(1,Math.min(overlay.max_messages,responsiveMax))
  const active=messages.filter(message=>overlay.fade_seconds===0||clock-message.time.getTime()<overlay.fade_seconds*1000)
  const ordered=overlay.direction==='top-down'?active:[...active].reverse()
  const rootStyle:any={fontFamily:overlay.font_family,fontSize:baseFont,fontWeight:overlay.font_weight,'--ctci-safe':`${safe}px`}

  return <div className={`overlay-root direction-${overlay.direction} theme-${overlay.theme} density-${overlay.density}`} style={rootStyle} data-viewport={`${viewport.width}x${viewport.height}`}>
    <style>{OVERLAY_RESET_CSS+'\n'+fontCss+'\n'+overlay.custom_css}</style>
    {ordered.slice(0,visibleLimit).map(message=>{
      const userKey=message.user.toLowerCase()
      const style=styles[userKey]
      if(style?.hidden)return null
      const role=roleFor(message.badges)
      const roleStyle=overlay.role_styles?.[role]||{}
      const messageRainbow=overlay.rainbow_mode==='messages'||overlay.rainbow_mode==='all'
      const nameRainbow=overlay.rainbow_mode==='usernames'||overlay.rainbow_mode==='all'
      const glow=style?.glow_color||roleStyle.glow_color||(overlay.glow_enabled?overlay.glow_color:null)
      const customBadges=badges[userKey]||[]
      const classes=['msg','chat-message',`anim-${overlay.animation}`,messageRainbow?'rainbow-text':''].filter(Boolean).join(' ')
      const messageFont=clamp((style?.font_size||overlay.font_size)*scale,10,192)

      return <div key={message.id} className={classes} style={{
        background:`rgba(${hex(overlay.bubble_color)},${overlay.bubble_opacity})`,
        borderRadius:radius,
        marginTop:spacing,
        color:style?.message_color||roleStyle.message_color||overlay.message_color,
        fontFamily:style?.font_family||roleStyle.font_family||overlay.font_family,
        fontSize:messageFont,
        fontWeight:style?.font_weight||overlay.font_weight,
        outline:style?.highlight?`${Math.max(1,2*scale)}px solid rgba(145,71,255,.7)`:'none',
        textShadow:glow?`0 0 ${Math.max(4,8*scale)}px ${glow},0 0 ${Math.max(8,18*scale)}px ${glow}`:undefined,
      }}>
        {overlay.show_timestamps&&<span className="small timestamp">{message.time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} </span>}
        {customBadges.map(badge=><span className={`custom-badge badge-${badge.slug}`} key={badge.id} title={badge.name} style={{borderColor:badge.color,color:badge.color}}>{badge.icon_url?<img src={badge.icon_url} alt={badge.name}/>:badge.icon_text||badge.name}</span>)}
        {overlay.show_usernames&&<strong className={nameRainbow?'rainbow-text':''} style={{
          color:nameRainbow?undefined:style?.username_color||roleStyle.username_color||message.color||overlay.username_color,
          fontFamily:roleStyle.username_font_family||overlay.username_font_family,
          fontSize:usernameFont,
        }}>{style?.icon?`${style.icon} `:''}{style?.nickname||message.name}</strong>}
        {' '}<MessageBody message={message} showEmotes={overlay.show_emotes}/>
      </div>
    })}
    <PluginOverlaySurface slug={params.slug}/>
  </div>
}

function MessageBody({message,showEmotes}:{message:Message;showEmotes:boolean}){
  if(!showEmotes||!message.fragments?.length)return <>{message.text}</>
  return <>{message.fragments.map((fragment,index)=>fragment.type==='emote'&&fragment.emote?.id
    ?<img key={index} className="chat-emote" alt={fragment.text} src={`https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(fragment.emote.id)}/static/dark/2.0`}/>
    :<span key={index}>{fragment.text}</span>)}</>
}

function roleFor(badges:any[]){
  const ids=(badges||[]).map(value=>String(value?.set_id||value?.id||'').toLowerCase())
  if(ids.includes('broadcaster'))return'broadcaster'
  if(ids.includes('moderator'))return'moderator'
  if(ids.includes('vip'))return'vip'
  if(ids.includes('founder'))return'founder'
  if(ids.includes('subscriber'))return'subscriber'
  return'viewer'
}

function toMessage(row:EventRow):Message{
  return{id:row.id,user:row.chatter_login,name:row.chatter_name||row.chatter_login,text:row.message_text,color:row.color,time:new Date(row.created_at),fragments:Array.isArray(row.fragments)?row.fragments:[],badges:Array.isArray(row.badges)?row.badges:[]}
}

function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,Number.isFinite(value)?value:min))}
function hex(value:string){
  const raw=value.replace('#','')
  const normalized=raw.length===3?raw.split('').map(char=>char+char).join(''):raw
  const number=parseInt(normalized,16)
  return`${(number>>16)&255},${(number>>8)&255},${number&255}`
}
