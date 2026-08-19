'use client'

import { useEffect, useState } from 'react'

type DashboardBlock=Record<string,any>
type Setting=Record<string,any>
type Card={id:string;title:string;description?:string;blocks?:DashboardBlock[];settings?:Setting[]}
type DashboardPlugin={installationId:string;pluginId:string;name:string;version:string;cards:Card[]}
type OverlayWidget=Record<string,any>
type OverlayPlugin={pluginId:string;name:string;version:string;widgets:OverlayWidget[]}

export function PluginDashboardSurface({placement='overview'}:{placement?:'overview'|'plugins'|'commands'|'badges'}){
  const[plugins,setPlugins]=useState<DashboardPlugin[]>([])
  const[configs,setConfigs]=useState<Record<string,Record<string,unknown>>>({})
  const[status,setStatus]=useState('')

  useEffect(()=>{let alive=true;(async()=>{
    const response=await fetch(`/api/plugins/ui?surface=dashboard&placement=${encodeURIComponent(placement)}`,{cache:'no-store'})
    if(!response.ok)return
    const body=await response.json()
    const list=(body.plugins||[]) as DashboardPlugin[]
    if(!alive)return
    setPlugins(list)
    const entries=await Promise.all(list.map(async plugin=>{
      const r=await fetch(`/api/plugins/config?installationId=${encodeURIComponent(plugin.installationId)}`,{cache:'no-store'})
      const b=r.ok?await r.json():{config:{}}
      return[plugin.installationId,b.config||{}] as const
    }))
    if(alive)setConfigs(Object.fromEntries(entries))
  })();return()=>{alive=false}},[placement])

  async function update(plugin:DashboardPlugin,field:Setting,value:unknown){
    setStatus('Saving plugin setting…')
    const response=await fetch('/api/plugins/config',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({installationId:plugin.installationId,key:field.key,value})})
    const body=await response.json().catch(()=>({}))
    if(!response.ok){setStatus(body.error||'Plugin setting failed');return}
    setConfigs(current=>({...current,[plugin.installationId]:{...(current[plugin.installationId]||{}),[field.key]:body.value}}))
    setStatus('Plugin setting saved')
  }

  if(!plugins.length)return null
  return <section className="plugin-surface" aria-label="Plugin extensions">
    <div className="section-head"><div><span className="section-kicker">PLUGIN EXTENSIONS</span><h2>Installed plugin UI</h2><p className="muted">These controls are provided by enabled plugins and rendered safely by CTCI.</p></div>{status&&<span className="small muted">{status}</span>}</div>
    <div className="setup-grid">
      {plugins.flatMap(plugin=>plugin.cards.map(card=><article className="panel" key={`${plugin.pluginId}:${card.id}`}>
        <div className="section-head"><div><span className="section-kicker">{plugin.name} · v{plugin.version}</span><h3>{card.title}</h3>{card.description&&<p className="muted">{card.description}</p>}</div></div>
        <div className="plugin-blocks">{(card.blocks||[]).map((block,index)=><DashboardBlockView block={block} key={index}/>)}</div>
        {!!card.settings?.length&&<div className="plugin-settings">{card.settings.map(field=><PluginSetting key={field.key} field={field} value={(configs[plugin.installationId]||{})[field.key]??field.default} onChange={value=>update(plugin,field,value)}/>)}</div>}
      </article>))}
    </div>
  </section>
}

function DashboardBlockView({block}:{block:DashboardBlock}){
  switch(block.type){
    case'heading':{const text=String(block.text||'');return block.level===4?<h4>{text}</h4>:block.level===3?<h3>{text}</h3>:<h2>{text}</h2>}
    case'text':return <p>{String(block.text||'')}</p>
    case'stat':return <div className="hero-status"><div><strong>{String(block.value||'')}</strong><span>{String(block.label||'')}</span></div></div>
    case'badge':return <span className="chip">{String(block.text||'')}</span>
    case'image':return <img src={String(block.src||'')} alt={String(block.alt||'')} style={{maxWidth:'100%',height:'auto',borderRadius:12}}/>
    case'link':return <a className={`btn ${block.variant==='primary'?'primary':''}`} href={String(block.href||'#')} target={String(block.href||'').startsWith('/')?undefined:'_blank'} rel="noreferrer">{String(block.label||'Open')}</a>
    case'progress':{const max=Math.max(0.000001,Number(block.max||100)),value=Math.min(max,Math.max(0,Number(block.value||0)));return <div className="field"><label>{String(block.label||'Progress')}</label><progress value={value} max={max} style={{width:'100%'}}/></div>}
    case'divider':return <hr className="divider"/>
    default:return null
  }
}

function PluginSetting({field,value,onChange}:{field:Setting;value:unknown;onChange:(value:unknown)=>void}){
  const label=<><label>{String(field.label||field.key)}</label>{field.description&&<span className="small muted">{String(field.description)}</span>}</>
  if(field.type==='boolean')return <div className="field">{label}<label className="check"><input type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked)}/> Enabled</label></div>
  if(field.type==='select')return <div className="field">{label}<select value={String(value??'')} onChange={e=>onChange(e.target.value)}>{(field.options||[]).map((option:any)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
  if(field.type==='number')return <div className="field">{label}<input type="number" value={Number(value??field.min??0)} min={field.min} max={field.max} step={field.step} onChange={e=>onChange(Number(e.target.value))}/></div>
  if(field.type==='color')return <div className="field">{label}<input type="color" value={String(value||'#ffffff')} onChange={e=>onChange(e.target.value)}/></div>
  return <div className="field">{label}<input value={String(value??'')} onChange={e=>onChange(e.target.value)} onBlur={e=>onChange(e.target.value)}/></div>
}

export function PluginOverlaySurface({slug}:{slug:string}){
  const[plugins,setPlugins]=useState<OverlayPlugin[]>([])
  useEffect(()=>{let alive=true;let timer:number|undefined;async function load(){const response=await fetch(`/api/plugins/ui?surface=overlay&slug=${encodeURIComponent(slug)}`,{cache:'no-store'});if(response.ok){const body=await response.json();if(alive)setPlugins(body.plugins||[])}if(alive)timer=window.setTimeout(load,15000)}void load();return()=>{alive=false;if(timer)window.clearTimeout(timer)}},[slug])
  if(!plugins.length)return null
  return <div className="plugin-overlay-layer" style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:50}}>{plugins.flatMap(plugin=>plugin.widgets.map(widget=><OverlayWidgetView key={`${plugin.pluginId}:${widget.id}`} widget={widget}/>))}</div>
}

function OverlayWidgetView({widget}:{widget:OverlayWidget}){
  const common:React.CSSProperties={position:'absolute',left:`${Number(widget.x??0)}%`,top:`${Number(widget.y??0)}%`,width:`${Number(widget.width??25)}%`,height:widget.height!==undefined?`${Number(widget.height)}%`:undefined,opacity:Number(widget.opacity??1),color:widget.color,background:widget.background,borderRadius:Number(widget.borderRadius??0),fontSize:widget.fontSize!==undefined?Number(widget.fontSize):undefined,zIndex:Number(widget.zIndex??0),overflow:'hidden'}
  if(widget.type==='image')return <img src={String(widget.src||'')} alt="" style={{...common,objectFit:'contain'}}/>
  if(widget.type==='box')return <div style={common}/>
  if(widget.type==='progress'){const max=Math.max(.000001,Number(widget.max||100)),value=Math.min(max,Math.max(0,Number(widget.value||0)));return <div style={common}><progress value={value} max={max} style={{width:'100%',height:'100%'}}/></div>}
  return <div style={common}>{String(widget.text||'')}</div>
}
