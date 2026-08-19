'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
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

  useEffect(()=>{
    let channel:any
    ;(async()=>{
      const{data,error}=await supabase.from('overlays').select('*').eq('slug',params.slug).eq('enabled',true).single()
      if(error||!data){setError('Overlay not found or disabled');return}
      const current=data as Overlay
      setOverlay(current)
      await loadExtras(current.user_id,current.id,current.max_messages)
      channel=supabase.channel(`ctci-overlay-${current.id}`)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_events',filter:`overlay_id=eq.${current.id}`},payload=>{
          setMessages(existing=>[...existing,toMessage(payload.new as EventRow)].slice(-100))
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'overlays',filter:`id=eq.${current.id}`},payload=>setOverlay(payload.new as Overlay))
        .on('postgres_changes',{event:'*',schema:'public',table:'chatter_styles',filter:`owner_id=eq.${current.user_id}`},()=>refreshStyles(current.user_id))
        .on('postgres_changes',{event:'*',schema:'public',table:'badge_assignments'},()=>refreshBadges(current.user_id))
        .on('postgres_changes',{event:'*',schema:'public',table:'badge_definitions'},()=>refreshBadges(current.user_id))
        .subscribe()
    })()
    return()=>{if(channel)supabase.removeChannel(channel)}
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

  if(error)return <div className="overlay-root"><div className="msg danger">{error}</div></div>
  if(!overlay)return <div className="overlay-root"/>

  const active=messages.filter(message=>overlay.fade_seconds===0||clock-message.time.getTime()<overlay.fade_seconds*1000)
  const ordered=overlay.direction==='top-down'?active:[...active].reverse()

  return <div className={`overlay-root direction-${overlay.direction} theme-${overlay.theme} density-${overlay.density}`} style={{fontFamily:overlay.font_family,fontSize:overlay.font_size,fontWeight:overlay.font_weight}}>
    <style>{fontCss+'\n'+overlay.custom_css}</style>
    {ordered.slice(0,overlay.max_messages).map(message=>{
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

      return <div key={message.id} className={classes} style={{
        background:`rgba(${hex(overlay.bubble_color)},${overlay.bubble_opacity})`,
        borderRadius:overlay.border_radius,
        marginTop:overlay.message_spacing,
        color:style?.message_color||roleStyle.message_color||overlay.message_color,
        fontFamily:style?.font_family||roleStyle.font_family||overlay.font_family,
        fontSize:style?.font_size||overlay.font_size,
        fontWeight:style?.font_weight||overlay.font_weight,
        outline:style?.highlight?'2px solid rgba(145,71,255,.7)':'none',
        textShadow:glow?`0 0 8px ${glow},0 0 18px ${glow}`:undefined,
      }}>
        {overlay.show_timestamps&&<span className="small timestamp">{message.time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} </span>}
        {customBadges.map(badge=><span className={`custom-badge badge-${badge.slug}`} key={badge.id} title={badge.name} style={{borderColor:badge.color,color:badge.color}}>{badge.icon_url?<img src={badge.icon_url} alt={badge.name}/>:badge.icon_text||badge.name}</span>)}
        {overlay.show_usernames&&<strong className={nameRainbow?'rainbow-text':''} style={{
          color:nameRainbow?undefined:style?.username_color||roleStyle.username_color||message.color||overlay.username_color,
          fontFamily:roleStyle.username_font_family||overlay.username_font_family,
          fontSize:overlay.username_font_size,
        }}>{style?.icon?`${style.icon} `:''}{style?.nickname||message.name}</strong>}
        {' '}<MessageBody message={message} showEmotes={overlay.show_emotes}/>
      </div>
    })}
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

function hex(value:string){
  const raw=value.replace('#','')
  const normalized=raw.length===3?raw.split('').map(char=>char+char).join(''):raw
  const number=parseInt(normalized,16)
  return`${(number>>16)&255},${(number>>8)&255},${number&255}`
}
