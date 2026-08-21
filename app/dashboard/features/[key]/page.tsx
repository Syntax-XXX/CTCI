'use client'

import Link from 'next/link'
import { useEffect,useMemo,useState } from 'react'
import { useParams,useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import { createClient } from '@/lib/supabase/client'

type Feature={key:string;name:string;description:string;requirements:string[];maturity:string}

export default function FeatureWorkbench(){
  const params=useParams<{key:string}>(),router=useRouter(),key=String(params.key||'')
  const[feature,setFeature]=useState<Feature|null>(null),[enabled,setEnabled]=useState(false),[data,setData]=useState<any>(null),[status,setStatus]=useState('Loading feature…'),[busy,setBusy]=useState(false)
  const[configText,setConfigText]=useState('{}'),[actionText,setActionText]=useState('{\n  "action": "save_config",\n  "config": {}\n}')
  const quick=useMemo(()=>quickAction(key),[key])

  useEffect(()=>{void load()},[key])
  async function load(){const sb=createClient(),{data:{user}}=await sb.auth.getUser();if(!user){router.replace('/auth');return}const f=await fetch('/api/features',{cache:'no-store'}),fb=await f.json().catch(()=>({}));if(!f.ok){setStatus(fb.error||'Could not load feature registry');return}const found=(fb.features||[]).find((x:any)=>x.key===key);if(!found){setStatus('Unknown feature');return}setFeature(found);const on=fb.flags?.[key]===true;setEnabled(on);if(!on){setStatus('This feature is disabled. Enable it in Feature Center first.');return}const r=await fetch(`/api/features/${encodeURIComponent(key)}`,{cache:'no-store'}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'Could not load feature');return}setData(b.data);setConfigText(JSON.stringify(b.data?.config||{},null,2));setStatus('Runtime loaded. BETA until live-tested and promoted.')}
  async function post(payload:any){setBusy(true);setStatus('Running feature action…');try{const r=await fetch(`/api/features/${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'Action failed');return null}setStatus('Action completed successfully.');await load();return b.result}finally{setBusy(false)}}
  async function saveConfig(){try{const config=JSON.parse(configText);await post({action:'save_config',config})}catch{setStatus('Configuration JSON is invalid.')}}
  async function runRaw(){try{await post(JSON.parse(actionText))}catch{setStatus('Action JSON is invalid.')}}
  async function runQuick(){if(!quick)return;const values:Record<string,string>={};for(const field of quick.fields){const input=document.getElementById(`feature-${field.name}`) as HTMLInputElement|HTMLTextAreaElement|null;values[field.name]=input?.value||''}await post(quick.payload(values))}
  async function runAI(mode:string){const input=document.getElementById('feature-ai-input') as HTMLTextAreaElement|null,target=document.getElementById('feature-ai-target') as HTMLInputElement|null;const payload=mode==='recap'?{}:mode==='builder'?{request:input?.value||''}:mode==='translate'?{text:input?.value||'',target:target?.value||'English'}:{text:input?.value||''};setBusy(true);try{const r=await fetch(`/api/ai/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),b=await r.json().catch(()=>({}));if(!r.ok){setStatus(b.error||'AI test failed');return}setStatus(`AI test passed using ${b.model||'configured model'}.`);setData((old:any)=>({...old,ai_test:b.text}))}finally{setBusy(false)}}
  async function signOut(){const sb=createClient();await sb.auth.signOut();router.replace('/')}

  return <><DashboardNav onSignOut={signOut}/><main className="app-main">
    <section className="dashboard-hero"><div><span className="eyebrow">FEATURE WORKBENCH · BETA</span><h1>{feature?.name||key}</h1><p>{feature?.description||'Loading…'}</p></div><div className="hero-status"><div><strong>{enabled?'Enabled · BETA':'Disabled'}</strong><span>{status}</span></div></div></section>
    {!enabled?<section className="panel"><p className="muted">The backend refuses to execute this feature while it is disabled.</p><Link className="btn primary" href="/dashboard/features">Open Feature Center</Link></section>:<>
      {quick&&<section className="panel"><div className="section-head"><div><span className="section-kicker">QUICK TEST</span><h2>{quick.title}</h2><p className="muted">This calls the real server-side runtime for this feature.</p></div></div>{quick.fields.map(field=><div className="field" key={field.name}><label>{field.label}</label>{field.multiline?<textarea id={`feature-${field.name}`} defaultValue={field.defaultValue||''}/>:<input id={`feature-${field.name}`} defaultValue={field.defaultValue||''}/>}</div>)}<button className="btn primary" disabled={busy} onClick={()=>void runQuick()}>{busy?'Running…':'Run action'}</button></section>}
      {['ai_moderation','ai_builder','ai_stream_recap','translation'].includes(key)&&<section className="panel"><div className="section-head"><div><span className="section-kicker">LIVE AI TEST</span><h2>Use your saved OpenAI key</h2></div></div>{key!=='ai_stream_recap'&&<div className="field"><label>Test input</label><textarea id="feature-ai-input" placeholder="Enter sample text or a feature request"/></div>}{key==='translation'&&<div className="field"><label>Target language</label><input id="feature-ai-target" defaultValue="English"/></div>}<button className="btn primary" disabled={busy} onClick={()=>void runAI(key==='ai_moderation'?'moderation':key==='ai_builder'?'builder':key==='translation'?'translate':'recap')}>Run real OpenAI test</button>{data?.ai_test&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{data.ai_test}</pre>}</section>}
      <section className="panel"><div className="section-head"><div><span className="section-kicker">CONFIGURATION</span><h2>Feature configuration</h2><p className="muted">Advanced JSON config. It is isolated to your streamer account.</p></div></div><div className="field"><textarea value={configText} onChange={e=>setConfigText(e.target.value)} rows={10}/></div><button className="btn primary" disabled={busy} onClick={()=>void saveConfig()}>Save configuration</button></section>
      <section className="panel"><div className="section-head"><div><span className="section-kicker">RUNTIME DATA</span><h2>Current feature state</h2></div></div><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:520,overflow:'auto'}}>{JSON.stringify(data,null,2)}</pre></section>
      <section className="panel"><div className="section-head"><div><span className="section-kicker">ADVANCED TEST</span><h2>Raw feature action</h2><p className="muted">For testing implemented actions before a dedicated form is added.</p></div></div><div className="field"><textarea value={actionText} onChange={e=>setActionText(e.target.value)} rows={9}/></div><button className="btn" disabled={busy} onClick={()=>void runRaw()}>Run action JSON</button></section>
    </>}
  </main></>
}

type Field={name:string;label:string;multiline?:boolean;defaultValue?:string}
type Quick={title:string;fields:Field[];payload:(v:Record<string,string>)=>any}
function quickAction(key:string):Quick|null{
  if(key==='chat_announcements')return{title:'Send an announcement to connected chats',fields:[{name:'message',label:'Announcement',multiline:true}],payload:v=>({action:'send',message:v.message})}
  if(key==='unified_moderation')return{title:'Create a blocked-word rule',fields:[{name:'name',label:'Rule name',defaultValue:'Blocked words'},{name:'words',label:'Blocked words (comma separated)'}],payload:v=>({action:'create_rule',name:v.name,rule_type:'blocked_words',config:{words:v.words.split(',').map(x=>x.trim()).filter(Boolean)},rule_action:{type:'hide'}})}
  if(key==='custom_commands')return{title:'Create a custom command',fields:[{name:'name',label:'Command name',defaultValue:'socials'},{name:'response',label:'Response template',multiline:true,defaultValue:'Hey {display_name}! Follow the stream on all socials.'}],payload:v=>({action:'save',name:v.name,response_template:v.response,permissions:['viewer']})}
  if(key==='cross_platform_polls')return{title:'Create a cross-platform poll',fields:[{name:'question',label:'Question'},{name:'options',label:'Options separated by |',defaultValue:'Yes | No'}],payload:v=>({action:'create',question:v.question,options:v.options.split('|').map(x=>x.trim())})}
  if(key==='giveaways')return{title:'Create a giveaway',fields:[{name:'title',label:'Giveaway title',defaultValue:'Stream Giveaway'}],payload:v=>({action:'create',title:v.title})}
  if(key==='predictions')return{title:'Create a prediction',fields:[{name:'question',label:'Question'},{name:'options',label:'Options separated by |',defaultValue:'Win | Lose'}],payload:v=>({action:'create',question:v.question,options:v.options.split('|').map(x=>x.trim())})}
  if(key==='automation_builder')return{title:'Create a keyword automation',fields:[{name:'name',label:'Automation name',defaultValue:'Hype trigger'},{name:'keyword',label:'Keyword',defaultValue:'hype'}],payload:v=>({action:'save',name:v.name,trigger:{type:'chat_message',keyword:v.keyword},conditions:[],actions:[{type:'audit',name:'hype.triggered'}]})}
  if(key==='multi_overlays')return{title:'Create another OBS overlay URL',fields:[{name:'name',label:'Overlay name',defaultValue:'Vertical Chat'},{name:'slug',label:'URL slug',defaultValue:'vertical-chat'}],payload:v=>({action:'create',name:v.name,slug:v.slug,settings:{max_messages:8,font_size:28}})}
  if(key==='template_marketplace')return{title:'Publish current overlay as a template',fields:[{name:'name',label:'Template name',defaultValue:'My Chat Theme'},{name:'description',label:'Description'}],payload:v=>({action:'publish',name:v.name,description:v.description})}
  if(key==='public_streamer_page')return{title:'Configure public streamer page',fields:[{name:'slug',label:'Public page slug'},{name:'title',label:'Page title'}],payload:v=>({action:'save',slug:v.slug,enabled:true,config:{title:v.title}})}
  if(key==='backup_snapshots'||key==='setup_export')return{title:key==='setup_export'?'Export current setup':'Create configuration snapshot',fields:[{name:'label',label:'Snapshot label',defaultValue:'Before changes'}],payload:v=>({action:key==='setup_export'?'export':'create',label:v.label})}
  if(key==='qna')return{title:'Q&A is collected from chat',fields:[],payload:()=>({action:'save_config',config:{command:'CC!ask'}})}
  if(key==='reward_store')return{title:'Create a reward',fields:[{name:'name',label:'Reward name',defaultValue:'Rainbow name'},{name:'cost',label:'Cost',defaultValue:'100'}],payload:v=>({action:'save',name:v.name,cost:Number(v.cost),description:'Viewer reward',reward_action:{type:'cosmetic',effect:'rainbow'}})}
  return null
}
