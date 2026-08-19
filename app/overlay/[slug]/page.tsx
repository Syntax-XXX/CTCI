'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Overlay={id:string;user_id:string;slug:string;channel_login:string|null;font_family:string;font_size:number;font_weight:number;message_spacing:number;username_color:string;message_color:string;background_color:string;background_opacity:number;bubble_color:string;bubble_opacity:number;border_radius:number;show_usernames:boolean;show_timestamps:boolean;animation:string;direction:string;custom_css:string;max_messages:number}
type Style={chatter_login:string;nickname:string|null;username_color:string|null;message_color:string|null;font_family:string|null;font_size:number|null;font_weight:number|null;highlight:boolean;hidden:boolean;icon:string|null}
type Msg={id:string;user:string;text:string;color?:string;time:Date}

export default function OverlayPage(){
  const params=useParams<{slug:string}>(); const supabase=useMemo(()=>createClient(),[])
  const [overlay,setOverlay]=useState<Overlay|null>(null);const [styles,setStyles]=useState<Record<string,Style>>({});const [messages,setMessages]=useState<Msg[]>([]);const [error,setError]=useState('')
  useEffect(()=>{(async()=>{const {data,error}=await supabase.from('overlays').select('*').eq('slug',params.slug).eq('enabled',true).single();if(error||!data){setError('Overlay not found or disabled');return}setOverlay(data as Overlay);const s=await supabase.from('chatter_styles').select('*').eq('owner_id',data.user_id);const map:Record<string,Style>={};(s.data||[]).forEach((x:any)=>map[x.chatter_login]=x);setStyles(map);
    const demo=[['system','CTCI overlay connected'],['stream_friend','Your styled messages will appear here'],['font_fan','Per-chatter fonts are ready ✨']];setMessages(demo.map((x,i)=>({id:String(i),user:x[0],text:x[1],time:new Date()})))
  })()},[params.slug,supabase])
  if(error)return <div className="overlay-root"><div className="msg danger">{error}</div></div>
  if(!overlay)return <div className="overlay-root" />
  const ordered=overlay.direction==='top-down'?messages:[...messages].reverse()
  return <div className="overlay-root" style={{fontFamily:overlay.font_family,fontSize:overlay.font_size,fontWeight:overlay.font_weight}}>
    <style>{overlay.custom_css}</style>
    {ordered.slice(0,overlay.max_messages).map(m=>{const s=styles[m.user.toLowerCase()];if(s?.hidden)return null;return <div key={m.id} className={`msg ${overlay.animation}`} style={{background:`rgba(${hex(overlay.bubble_color)},${overlay.bubble_opacity})`,borderRadius:overlay.border_radius,marginTop:overlay.message_spacing,color:s?.message_color||overlay.message_color,fontFamily:s?.font_family||overlay.font_family,fontSize:s?.font_size||overlay.font_size,fontWeight:s?.font_weight||overlay.font_weight,outline:s?.highlight?'2px solid rgba(145,71,255,.7)':'none'}}>
      {overlay.show_timestamps&&<span className="small muted">{m.time.toLocaleTimeString()} </span>}{overlay.show_usernames&&<strong style={{color:s?.username_color||overlay.username_color}}>{s?.icon?`${s.icon} `:''}{s?.nickname||m.user}</strong>} {m.text}
    </div>})}
    {!overlay.channel_login&&<div className="small muted">Set a Twitch channel in the CTCI dashboard.</div>}
  </div>
}
function hex(v:string){const h=v.replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return `${(n>>16)&255},${(n>>8)&255},${n&255}`}
