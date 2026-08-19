'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Overlay={id:string;user_id:string;slug:string;channel_login:string|null;font_family:string;font_size:number;font_weight:number;message_spacing:number;username_color:string;message_color:string;background_color:string;background_opacity:number;bubble_color:string;bubble_opacity:number;border_radius:number;show_usernames:boolean;show_timestamps:boolean;show_emotes:boolean;animation:string;direction:string;custom_css:string;max_messages:number;fade_seconds:number}
type Style={chatter_login:string;nickname:string|null;username_color:string|null;message_color:string|null;font_family:string|null;font_size:number|null;font_weight:number|null;highlight:boolean;hidden:boolean;icon:string|null}
type FontAsset={label:string;storage_path:string;mime_type:string}
type Fragment={type:string;text:string;emote?:{id:string;format?:string[]} | null}
type ChatEvent={id:string;chatter_login:string;chatter_name:string;message_text:string;color:string|null;badges:any[];fragments:Fragment[];reply:any;created_at:string}
type Msg={id:string;user:string;name:string;text:string;color?:string|null;time:Date;fragments:Fragment[]}

export default function OverlayPage(){
  const params=useParams<{slug:string}>(); const supabase=useMemo(()=>createClient(),[])
  const [overlay,setOverlay]=useState<Overlay|null>(null);const [styles,setStyles]=useState<Record<string,Style>>({});const [fontCss,setFontCss]=useState('');const [messages,setMessages]=useState<Msg[]>([]);const [error,setError]=useState('');const [clock,setClock]=useState(Date.now())

  useEffect(()=>{let channel:any;(async()=>{
    const {data,error}=await supabase.from('overlays').select('*').eq('slug',params.slug).eq('enabled',true).single();if(error||!data){setError('Overlay not found or disabled');return}
    setOverlay(data as Overlay)
    const [styleRes,fontRes,eventRes]=await Promise.all([
      supabase.from('chatter_styles').select('*').eq('owner_id',data.user_id),
      supabase.from('font_assets').select('label,storage_path,mime_type').eq('owner_id',data.user_id),
      supabase.from('chat_events').select('id,chatter_login,chatter_name,message_text,color,badges,fragments,reply,created_at').eq('overlay_id',data.id).order('created_at',{ascending:false}).limit(data.max_messages),
    ])
    const map:Record<string,Style>={};(styleRes.data||[]).forEach((x:any)=>map[x.chatter_login]=x);setStyles(map)
    const css=(fontRes.data||[] as FontAsset[]).map((font)=>{const publicUrl=supabase.storage.from('ctci-fonts').getPublicUrl(font.storage_path).data.publicUrl;return `@font-face{font-family:${JSON.stringify(font.label)};src:url(${JSON.stringify(publicUrl)});font-display:swap;}`}).join('\n');setFontCss(css)
    const initial=((eventRes.data||[]) as ChatEvent[]).reverse().map(toMessage);setMessages(initial)
    channel=supabase.channel(`ctci-overlay-${data.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_events',filter:`overlay_id=eq.${data.id}`},(payload)=>{
      const msg=toMessage(payload.new as ChatEvent);setMessages(prev=>[...prev,msg].slice(-100))
    }).subscribe()
  })();return()=>{if(channel)supabase.removeChannel(channel)}},[params.slug,supabase])

  useEffect(()=>{if(!overlay?.fade_seconds)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[overlay?.fade_seconds])

  if(error)return <div className="overlay-root"><div className="msg danger">{error}</div></div>
  if(!overlay)return <div className="overlay-root" />
  const active=messages.filter(m=>overlay.fade_seconds===0||clock-m.time.getTime()<overlay.fade_seconds*1000)
  const ordered=overlay.direction==='top-down'?active:[...active].reverse()
  return <div className={`overlay-root direction-${overlay.direction}`} style={{fontFamily:overlay.font_family,fontSize:overlay.font_size,fontWeight:overlay.font_weight}}>
    <style>{fontCss+'\n'+overlay.custom_css}</style>
    {ordered.slice(0,overlay.max_messages).map(m=>{const s=styles[m.user.toLowerCase()];if(s?.hidden)return null;return <div key={m.id} className={`msg chat-message anim-${overlay.animation}`} style={{background:`rgba(${hex(overlay.bubble_color)},${overlay.bubble_opacity})`,borderRadius:overlay.border_radius,marginTop:overlay.message_spacing,color:s?.message_color||overlay.message_color,fontFamily:s?.font_family||overlay.font_family,fontSize:s?.font_size||overlay.font_size,fontWeight:s?.font_weight||overlay.font_weight,outline:s?.highlight?'2px solid rgba(145,71,255,.7)':'none'}}>
      {overlay.show_timestamps&&<span className="small timestamp">{m.time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} </span>}{overlay.show_usernames&&<strong style={{color:s?.username_color||m.color||overlay.username_color}}>{s?.icon?`${s.icon} `:''}{s?.nickname||m.name}</strong>} <MessageBody message={m} showEmotes={overlay.show_emotes}/>
    </div>})}
    {overlay.channel_login&&messages.length===0&&<div className="overlay-status">Waiting for chat in #{overlay.channel_login}…</div>}
    {!overlay.channel_login&&<div className="overlay-status">Set a Twitch channel in the CTCI dashboard.</div>}
  </div>
}

function MessageBody({message,showEmotes}:{message:Msg;showEmotes:boolean}){
  if(!showEmotes||!message.fragments?.length)return <>{message.text}</>
  return <>{message.fragments.map((fragment,index)=>fragment.type==='emote'&&fragment.emote?.id?<img key={`${message.id}-${index}`} className="chat-emote" alt={fragment.text} src={`https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(fragment.emote.id)}/static/dark/2.0`}/>:<span key={`${message.id}-${index}`}>{fragment.text}</span>)}</>
}
function toMessage(x:ChatEvent):Msg{return{id:x.id,user:x.chatter_login,name:x.chatter_name||x.chatter_login,text:x.message_text,color:x.color,time:new Date(x.created_at),fragments:Array.isArray(x.fragments)?x.fragments:[]}}
function hex(v:string){const h=v.replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return `${(n>>16)&255},${(n>>8)&255},${n&255}`}
