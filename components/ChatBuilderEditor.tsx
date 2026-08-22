'use client'

import { useEffect,useState } from 'react'
import { DEFAULT_CHAT_BUILDER,SYMBOL_POSITIONS,type BuilderSymbol,type ChatBuilderConfig,type SymbolPosition } from '@/lib/chat-builder'

type Asset={id:string;label:string;url:string}
const PLACE:Record<SymbolPosition,string>={row_before:'Before whole message',username_before:'Before username',username_after:'After username',row_after:'After whole message'}
const EMOJIS:{name:string;items:string[]}[]=[
  {name:'Hearts',items:['♡','♥','💕','💜','💗','💖','💞','💘','🖤','🤍','💙','❤️‍🔥']},
  {name:'Stars',items:['★','☆','✦','✧','✨','🌟','⭐','💫','⚡','☄️','🔮','🌙']},
  {name:'Cute',items:['🌸','🌺','🌷','🍓','🍒','🦋','🐾','🎀','🪽','☁️','🫧','🍀']},
  {name:'Hype',items:['🔥','💯','👑','🚀','🎉','🎊','🏆','💎','⚔️','🛡️','💥','‼️']},
  {name:'Faces',items:['😎','🥺','😭','😂','🤣','😈','👀','🤡','🫡','🤝','🗿','💀']},
  {name:'Gaming',items:['🎮','🕹️','👾','🎲','🎯','🏹','🧪','💰','🪙','🔑','🧿','📺']},
]
const presets:Record<string,Partial<ChatBuilderConfig>>={
  Reference:{enabled:true,layout:{mode:'stacked',align:'left',gap:7,maxWidth:520},username:{...DEFAULT_CHAT_BUILDER.username,background:'#B755F2',radius:7,fontSize:18},message:{...DEFAULT_CHAT_BUILDER.message,background:'#292936',opacity:.72,radius:7,fontSize:18}},
  Clean:{enabled:true,username:{...DEFAULT_CHAT_BUILDER.username,mode:'plain',opacity:0},message:{...DEFAULT_CHAT_BUILDER.message,background:'#0A0A0A',opacity:.55,shadow:'none'}},
  Neon:{enabled:true,username:{...DEFAULT_CHAT_BUILDER.username,background:'#8B5CF6',radius:14},message:{...DEFAULT_CHAT_BUILDER.message,background:'#090512',opacity:.82,borderWidth:1,borderColor:'#8B5CF6',radius:14,shadow:'strong'}},
}
const CSS_SAMPLE=`/* Advanced CSS — no <style> tag needed */
.overlay-root .chat-message {
  transform: skewX(-1deg);
}

.overlay-root .chat-message strong {
  letter-spacing: .04em;
  text-transform: none;
}

.overlay-root .platform-icon {
  filter: drop-shadow(0 0 5px #9147ff);
}

.overlay-root .custom-badge {
  transform: translateY(-1px);
}`

export default function ChatBuilderEditor(){
  const[cfg,setCfg]=useState(DEFAULT_CHAT_BUILDER),[assets,setAssets]=useState<Asset[]>([]),[slug,setSlug]=useState(''),[status,setStatus]=useState('Loading…'),[busy,setBusy]=useState(false),[customCss,setCustomCss]=useState(''),[placement,setPlacement]=useState<SymbolPosition>('username_after'),[customSymbol,setCustomSymbol]=useState('')
  useEffect(()=>{void fetch('/api/overlay/builder',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setCfg(b.config);setAssets(b.assets||[]);setSlug(b.slug||'');setCustomCss(b.customCss||'');setStatus('Ready — preview is local until Save.')}).catch(e=>setStatus(e.message))},[])

  const set=(path:string,value:any)=>setCfg(c=>{const n=structuredClone(c) as any,p=path.split('.');let x=n;for(let i=0;i<p.length-1;i++)x=x[p[i]];x[p[p.length-1]]=value;return n})
  async function save(){setBusy(true);setStatus('Saving…');try{const r=await fetch('/api/overlay/builder',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:cfg,customCss})}),b=await r.json();if(!r.ok)throw new Error(b.error);setCfg(b.config);setCustomCss(b.customCss||'');setStatus('Saved — symbols and CSS are now live in OBS.')}catch(e:any){setStatus(e.message||'Save failed')}finally{setBusy(false)}}
  async function upload(file:File){const f=new FormData();f.set('file',file);f.set('label',file.name);setStatus('Uploading…');const r=await fetch('/api/overlay/builder',{method:'POST',body:f}),b=await r.json();if(!r.ok){setStatus(b.error||'Upload failed');return}setAssets(a=>[b.asset,...a]);setStatus('Uploaded. Choose a placement, then click the image.')}
  function placeSymbol(type:'text'|'image',value:string,at=placement){if(!value.trim())return;const existing=cfg.symbols.find(s=>s.position===at),s:BuilderSymbol={id:existing?.id||crypto.randomUUID(),type,value:value.slice(0,type==='image'?500:32),position:at,size:existing?.size||20,gap:existing?.gap||4};setCfg(c=>({...c,symbols:[...c.symbols.filter(x=>x.position!==at),s]}));setStatus(`${type==='image'?'Image':'Symbol'} placed: ${PLACE[at]}`)}
  function patchSymbol(at:SymbolPosition,key:'position'|'size'|'gap'|'value',value:any){setCfg(c=>{const current=c.symbols.find(s=>s.position===at);if(!current)return c;if(key==='position'){const next=value as SymbolPosition;return{...c,symbols:[...c.symbols.filter(s=>s.position!==at&&s.position!==next),{...current,position:next}]}}return{...c,symbols:c.symbols.map(s=>s.position===at?{...s,[key]:value}:s)}})}
  function remove(at:SymbolPosition){setCfg(c=>({...c,symbols:c.symbols.filter(s=>s.position!==at)}))}

  return <div className="builder-layout">
    <section className="panel builder-controls">
      <div className="section-head"><div><h2>Controls</h2><p className="muted">{status}</p></div></div>
      <div className="actions flush">{Object.entries(presets).map(([name,preset])=><button key={name} className="btn compact" onClick={()=>setCfg({...structuredClone(DEFAULT_CHAT_BUILDER),...structuredClone(preset)} as ChatBuilderConfig)}>{name}</button>)}<label className="check"><input type="checkbox" checked={cfg.enabled} onChange={e=>set('enabled',e.target.checked)}/> Enabled</label></div>

      <Group title="Layout"><Sel label="Mode" v={cfg.layout.mode} values={['stacked','compact']} set={v=>set('layout.mode',v)}/><Sel label="Align" v={cfg.layout.align} values={['left','center','right']} set={v=>set('layout.align',v)}/><Num label="Gap" v={cfg.layout.gap} min={0} max={64} set={v=>set('layout.gap',v)}/><Num label="Max width" v={cfg.layout.maxWidth} min={180} max={1920} set={v=>set('layout.maxWidth',v)}/></Group>
      <Group title="Username"><Sel label="Style" v={cfg.username.mode} values={['chip','plain']} set={v=>set('username.mode',v)}/><Clr label="Chip" v={cfg.username.background} set={v=>set('username.background',v)}/><Clr label="Text" v={cfg.username.textColor} set={v=>set('username.textColor',v)}/><Num label="Opacity" v={cfg.username.opacity} min={0} max={1} step={.05} set={v=>set('username.opacity',v)}/><Num label="Radius" v={cfg.username.radius} min={0} max={64} set={v=>set('username.radius',v)}/><Num label="Size" v={cfg.username.fontSize} min={8} max={96} set={v=>set('username.fontSize',v)}/><Txt label="Prefix" v={cfg.username.prefix} set={v=>set('username.prefix',v)}/><Txt label="Suffix" v={cfg.username.suffix} set={v=>set('username.suffix',v)}/><Check label="Platform icon" v={cfg.username.showPlatformIcon} set={v=>set('username.showPlatformIcon',v)}/><Check label="Badges" v={cfg.username.showBadges} set={v=>set('username.showBadges',v)}/></Group>
      <Group title="Message"><Clr label="Bubble" v={cfg.message.background} set={v=>set('message.background',v)}/><Clr label="Text" v={cfg.message.textColor} set={v=>set('message.textColor',v)}/><Num label="Opacity" v={cfg.message.opacity} min={0} max={1} step={.05} set={v=>set('message.opacity',v)}/><Num label="Blur" v={cfg.message.blur} min={0} max={40} set={v=>set('message.blur',v)}/><Num label="Radius" v={cfg.message.radius} min={0} max={64} set={v=>set('message.radius',v)}/><Num label="Font size" v={cfg.message.fontSize} min={8} max={128} set={v=>set('message.fontSize',v)}/><Num label="Border" v={cfg.message.borderWidth} min={0} max={8} set={v=>set('message.borderWidth',v)}/><Sel label="Shadow" v={cfg.message.shadow} values={['none','soft','strong']} set={v=>set('message.shadow',v)}/></Group>

      <fieldset className="builder-group">
        <legend>Custom symbols & emoji</legend>
        <p className="small muted builder-section-copy">Choose a placement first. Each placement has one deterministic slot; a text slot can contain multiple Unicode symbols.</p>
        <div className="field"><label>Placement</label><select value={placement} onChange={e=>setPlacement(e.target.value as SymbolPosition)}>{SYMBOL_POSITIONS.map(x=><option key={x} value={x}>{PLACE[x]}</option>)}</select></div>
        <div className="field"><label>Custom emoji / symbol sequence</label><input value={customSymbol} maxLength={32} onChange={e=>setCustomSymbol(e.target.value)} placeholder="♡ ✦ 🌸 or anything Unicode"/></div>
        <button className="btn compact" type="button" onClick={()=>{placeSymbol('text',customSymbol);setCustomSymbol('')}}>Add to {PLACE[placement].toLowerCase()}</button>

        {EMOJIS.map(group=><div key={group.name} className="builder-emoji-group"><div className="small muted builder-emoji-label">{group.name}</div><div className="builder-emoji-grid">{group.items.map(emoji=><button key={emoji} type="button" className="btn compact ghost builder-emoji-button" title={`Place ${emoji} · ${PLACE[placement]}`} onClick={()=>placeSymbol('text',emoji)}>{emoji}</button>)}</div></div>)}

        <div className="builder-asset-wrap">
          <label className="btn compact">Upload custom icon<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f)}}/></label>
          {assets.length>0&&<div className="builder-asset-grid">{assets.slice(0,12).map(asset=><button key={asset.id} className="btn compact ghost builder-asset-button" title={`${asset.label} → ${PLACE[placement]}`} onClick={()=>placeSymbol('image',asset.url)}><img src={asset.url} alt="" className="builder-asset-image"/></button>)}</div>}
        </div>

        <div className="builder-symbol-slots">{SYMBOL_POSITIONS.map(at=>{const symbol=cfg.symbols.find(x=>x.position===at);return <div className="setup-card" key={at}><div className="setup-copy"><strong>{PLACE[at]}</strong>{!symbol?<span className="small muted">Empty</span>:<><span className="small muted">{symbol.type==='image'?'Uploaded image':symbol.value}</span><div className="row"><div className="field"><label>Size</label><input type="number" min="8" max="96" value={symbol.size} onChange={e=>patchSymbol(at,'size',Number(e.target.value))}/></div><div className="field"><label>Spacing</label><input type="number" min="0" max="40" value={symbol.gap} onChange={e=>patchSymbol(at,'gap',Number(e.target.value))}/></div></div><div className="field"><label>Move to</label><select value={symbol.position} onChange={e=>patchSymbol(at,'position',e.target.value)}>{SYMBOL_POSITIONS.map(x=><option key={x} value={x}>{PLACE[x]}</option>)}</select></div>{symbol.type==='text'&&<div className="field"><label>Edit symbol</label><input value={symbol.value} maxLength={32} onChange={e=>patchSymbol(at,'value',e.target.value)}/></div>}</>}</div>{symbol&&<button className="btn compact ghost" onClick={()=>remove(at)}>Remove</button>}</div>})}</div>
      </fieldset>

      <fieldset className="builder-group">
        <legend>Advanced CSS <span className="small">BETA</span></legend>
        <p className="small muted builder-section-copy">Applied after the visual builder. Use normal CSS only — no &lt;style&gt; tag. External url() calls are blocked except your uploaded CTCI assets and fonts.</p>
        <div className="field"><textarea className="builder-css-textarea" value={customCss} onChange={e=>setCustomCss(e.target.value)} spellCheck={false} placeholder={CSS_SAMPLE}/><span className="small muted">Useful selectors: .overlay-root · .chat-message · .chat-message strong · .platform-icon · .custom-badge · .chat-emote · .special-event</span></div>
        <div className="actions"><button className="btn compact" onClick={()=>setCustomCss(CSS_SAMPLE)}>Load example</button><button className="btn compact ghost" onClick={()=>setCustomCss('')}>Clear CSS</button></div>
      </fieldset>

      <div className="actions builder-savebar"><button className="btn primary" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save symbols + CSS to OBS'}</button>{slug&&<a className="btn" href={`/overlay/${slug}`} target="_blank" rel="noreferrer">Open overlay</a>}</div>
    </section>

    <section className="panel builder-preview-panel">
      <div className="section-head"><div><h2>Live visual preview</h2><p className="muted">Builder changes preview instantly. Validated advanced CSS is applied to the actual OBS overlay after Save.</p></div></div>
      <Preview c={cfg}/>
    </section>
  </div>
}

function Preview({c}:{c:ChatBuilderConfig}){
  const rows=[['Spiky7489','this chat can be styled per streamer'],['Cody0ELF','custom symbols and badges ✨'],['Drachengott0815','Denke ich auch, hab gleich wieder 20 memes auf vorrat']]
  const alignItems=c.layout.align==='center'?'center':c.layout.align==='right'?'flex-end':'flex-start'
  return <div className="builder-preview-canvas" style={{gap:c.layout.gap,alignItems}}>{rows.map(([name,message])=><div className="builder-preview-row" key={name} style={{width:`min(100%,${c.layout.maxWidth}px)`}}>{Slot(c,'row_before')}<div className="builder-preview-userline">{c.username.showPlatformIcon&&<span className="builder-preview-platform">▣</span>}<strong className="builder-preview-name" style={{background:c.username.mode==='chip'?alpha(c.username.background,c.username.opacity):'transparent',color:c.username.textColor,borderRadius:c.username.radius,padding:c.username.mode==='chip'?`${c.username.paddingY}px ${c.username.paddingX}px`:0,fontSize:c.username.fontSize}}>{Slot(c,'username_before')}{c.username.prefix}{name}{c.username.suffix}{Slot(c,'username_after')}</strong>{c.username.showBadges&&<span className="builder-preview-badges">♙ ♙ ♙</span>}</div><div className="builder-preview-message" style={{marginTop:c.layout.mode==='stacked'?c.username.gap:0,background:alpha(c.message.background,c.message.opacity),color:c.message.textColor,borderRadius:c.message.radius,padding:`${c.message.paddingY}px ${c.message.paddingX}px`,fontSize:c.message.fontSize,backdropFilter:`blur(${c.message.blur}px)`,border:`${c.message.borderWidth}px solid ${c.message.borderColor}`}}>{message}</div>{Slot(c,'row_after')}</div>)}</div>
}
function Slot(c:ChatBuilderConfig,at:SymbolPosition){const symbol=c.symbols.find(x=>x.position===at);if(!symbol)return null;return symbol.type==='image'?<img src={symbol.value} alt="" className="builder-preview-slot" style={{width:symbol.size,height:symbol.size,margin:symbol.gap}}/>:<span className="builder-preview-slot" style={{fontSize:symbol.size,margin:symbol.gap}}>{symbol.value}</span>}
const alpha=(hex:string,opacity:number)=>{const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${opacity})`}
function Group({title,children}:{title:string;children:any}){return <fieldset className="builder-group"><legend>{title}</legend><div className="row">{children}</div></fieldset>}
function Num({label,v,set,min,max,step=1}:{label:string;v:number;set:(v:number)=>void;min:number;max:number;step?:number}){return <div className="field"><label>{label}</label><input type="number" value={v} min={min} max={max} step={step} onChange={e=>set(Number(e.target.value))}/></div>}
function Clr({label,v,set}:{label:string;v:string;set:(v:string)=>void}){return <div className="field"><label>{label}</label><input type="color" value={v} onChange={e=>set(e.target.value)}/></div>}
function Txt({label,v,set}:{label:string;v:string;set:(v:string)=>void}){return <div className="field"><label>{label}</label><input value={v} maxLength={12} onChange={e=>set(e.target.value)}/></div>}
function Sel({label,v,values,set}:{label:string;v:string;values:string[];set:(v:string)=>void}){return <div className="field"><label>{label}</label><select value={v} onChange={e=>set(e.target.value)}>{values.map(x=><option key={x}>{x}</option>)}</select></div>}
function Check({label,v,set}:{label:string;v:boolean;set:(v:boolean)=>void}){return <label className="check"><input type="checkbox" checked={v} onChange={e=>set(e.target.checked)}/>{label}</label>}
