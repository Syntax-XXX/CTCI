'use client'

import { useEffect,useRef,useState } from 'react'

type State={flags?:Record<string,boolean>;featured?:any;qna?:any;poll?:any;prediction?:any;paidEvent?:any;tts?:{config:any;message:any}}

export default function FeatureOverlaySurface({slug}:{slug:string}){
  const[state,setState]=useState<State>({}),spoken=useRef<string>(''),lastSpokenAt=useRef(0)
  useEffect(()=>{let alive=true,timer:number|undefined;async function poll(){try{const r=await fetch(`/api/overlay/features?slug=${encodeURIComponent(slug)}`,{cache:'no-store'});if(r.ok){const b=await r.json();if(alive)setState(b)}}catch{}finally{if(alive)timer=window.setTimeout(poll,2500)}}void poll();return()=>{alive=false;if(timer)window.clearTimeout(timer)}},[slug])
  useEffect(()=>{
    const t=state.tts
    if(!t?.config?.enabled||!t.message?.id||spoken.current===t.message.id||typeof window==='undefined'||!('speechSynthesis'in window))return
    const role=roleFor(t.message.badges||[]),roles=Array.isArray(t.config.roles)?t.config.roles:['viewer','subscriber','vip','moderator','broadcaster']
    if(!roles.includes(role))return
    const cooldownMs=Math.max(0,Math.min(60000,Number(t.config.cooldownMs||1500)))
    if(Date.now()-lastSpokenAt.current<cooldownMs)return
    const raw=String(t.message.message_text||'').replace(/https?:\/\/\S+/gi,'[link]').replace(/[\u0000-\u001f\u007f]/g,' ').trim()
    const blocked=Array.isArray(t.config.blockedWords)?t.config.blockedWords.map((x:any)=>String(x).toLowerCase()).filter(Boolean):[]
    if(blocked.some((word:string)=>raw.toLowerCase().includes(word)))return
    spoken.current=t.message.id;lastSpokenAt.current=Date.now()
    const text=`${t.config.includeName?`${cleanName(t.message.chatter_name)}: `:''}${raw.slice(0,t.config.maxLength||220)}`.trim();if(!text)return
    const u=new SpeechSynthesisUtterance(text);u.rate=Number(t.config.rate||1);u.pitch=Number(t.config.pitch||1);u.volume=Number(t.config.volume||1);window.speechSynthesis.speak(u)
  },[state.tts])
  const card:React.CSSProperties={background:'rgba(8,8,14,.9)',border:'1px solid rgba(255,255,255,.18)',borderRadius:16,padding:'14px 16px',boxShadow:'0 12px 38px rgba(0,0,0,.3)',color:'#fff',backdropFilter:'blur(10px)'}
  return <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:45,fontFamily:'Inter,system-ui,sans-serif'}}>
    {state.featured&&<div style={{...card,position:'absolute',left:'50%',bottom:'7%',transform:'translateX(-50%)',width:'min(760px,90vw)'}}><div style={{fontSize:12,opacity:.65,fontWeight:800}}>FEATURED MESSAGE · {platform(state.featured.source)}</div><div style={{fontWeight:800,marginTop:4}}>{cleanName(state.featured.chatter_name)}</div><div style={{fontSize:20,marginTop:4}}>{state.featured.message_text}</div></div>}
    {state.qna&&<div style={{...card,position:'absolute',right:'3%',top:'8%',width:'min(480px,43vw)'}}><div style={{fontSize:12,opacity:.65,fontWeight:800}}>Q&A · {platform(state.qna.source)}</div><div style={{fontWeight:800,marginTop:4}}>{state.qna.display_name}</div><div style={{fontSize:18,marginTop:4}}>{state.qna.question}</div></div>}
    {state.poll&&<PollCard title={state.poll.question} options={state.poll.options} counts={state.poll.counts} label="LIVE POLL" card={card}/>}
    {!state.poll&&state.prediction&&<PollCard title={state.prediction.question} options={state.prediction.options} counts={state.prediction.counts} label="PREDICTION" card={card}/>}
    {state.paidEvent&&Date.now()-Date.parse(state.paidEvent.created_at)<20000&&<div style={{...card,position:'absolute',left:'3%',top:'8%',width:'min(460px,42vw)'}}><div style={{fontSize:12,fontWeight:900}}>★ {String(state.paidEvent.event_type||'SPECIAL EVENT').replaceAll('_',' ').toUpperCase()} · {platform(state.paidEvent.source)}</div><div style={{fontWeight:800,marginTop:5}}>{cleanName(state.paidEvent.chatter_name)}</div><div style={{marginTop:3}}>{state.paidEvent.message_text}</div></div>}
  </div>
}
function PollCard({title,options,counts,label,card}:{title:string;options:any[];counts:number[];label:string;card:React.CSSProperties}){const opts=Array.isArray(options)?options:[],total=(counts||[]).reduce((a,b)=>a+Number(b||0),0);return <div style={{...card,position:'absolute',left:'3%',bottom:'7%',width:'min(440px,42vw)'}}><div style={{fontSize:12,opacity:.65,fontWeight:800}}>{label}</div><div style={{fontSize:18,fontWeight:800,margin:'5px 0 8px'}}>{title}</div>{opts.map((o,i)=>{const count=Number(counts?.[i]||0),pct=total?Math.round(count/total*100):0;return <div key={i} style={{marginTop:7}}><div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:14}}><span>{i+1}. {String(o)}</span><span>{pct}%</span></div><div style={{height:5,background:'rgba(255,255,255,.15)',borderRadius:8,overflow:'hidden',marginTop:3}}><div style={{height:'100%',width:`${pct}%`,background:'currentColor'}}/></div></div>})}<div style={{fontSize:11,opacity:.6,marginTop:8}}>{total} response{total===1?'':'s'}</div></div>}
function platform(source:string){return source==='youtube'?'YouTube':source==='twitch'?'Twitch':'CTCI'}
function roleFor(badges:any[]){const ids=(badges||[]).map(value=>String(value?.set_id||value?.id||'').toLowerCase());if(ids.includes('broadcaster'))return'broadcaster';if(ids.includes('moderator'))return'moderator';if(ids.includes('vip'))return'vip';if(ids.includes('founder'))return'subscriber';if(ids.includes('subscriber'))return'subscriber';return'viewer'}
function cleanName(value:string){return String(value||'').replace(/^🟣\s*/,'').replace(/^🔴▶\s*/,'')}
