import { isFeatureEnabled } from '@/lib/features'

type AutomationEvent={type:string;source?:string;text?:string;eventType?:string;userId?:string;displayName?:string;metadata?:Record<string,unknown>}

export async function runAutomations(admin:any,ownerId:string,event:AutomationEvent){
  if(!await isFeatureEnabled(admin,ownerId,'automation_builder'))return
  const rules=await admin.from('automation_rules').select('*').eq('owner_id',ownerId).eq('enabled',true)
  if(rules.error)throw rules.error
  for(const rule of rules.data||[]){
    if(!matches(rule.trigger||{},event)||!conditionsPass(rule.conditions||[],event))continue
    const actions=Array.isArray(rule.actions)?rule.actions:[]
    for(const action of actions.slice(0,12))await executeAction(admin,ownerId,action,event)
    await admin.from('audit_events').insert({owner_id:ownerId,actor_user_id:null,action:'automation.execute',target_type:'automation_rule',target_id:String(rule.id),metadata:{event_type:event.type,source:event.source||null,actions:actions.length}})
  }
}

function matches(trigger:any,event:AutomationEvent){
  const type=String(trigger.type||'chat_message')
  if(type!==event.type)return false
  if(trigger.source&&String(trigger.source)!==String(event.source||''))return false
  if(trigger.event_type&&String(trigger.event_type)!==String(event.eventType||''))return false
  if(trigger.keyword&&!String(event.text||'').toLowerCase().includes(String(trigger.keyword).toLowerCase()))return false
  return true
}
function conditionsPass(conditions:any,event:AutomationEvent){
  if(!Array.isArray(conditions))return true
  for(const condition of conditions){
    const field=String(condition?.field||''),op=String(condition?.op||'eq'),expected=condition?.value
    const actual=field==='text'?event.text:field==='source'?event.source:field==='eventType'?event.eventType:event.metadata?.[field]
    if(op==='eq'&&String(actual??'')!==String(expected??''))return false
    if(op==='contains'&&!String(actual??'').toLowerCase().includes(String(expected??'').toLowerCase()))return false
    if(op==='gte'&&Number(actual)<Number(expected))return false
    if(op==='lte'&&Number(actual)>Number(expected))return false
  }
  return true
}
async function executeAction(admin:any,ownerId:string,action:any,event:AutomationEvent){
  const type=String(action?.type||'')
  if(type==='overlay_patch'){
    const allowed=['theme','font_family','username_font_family','font_size','username_font_size','message_color','username_color','background_color','background_opacity','bubble_color','bubble_opacity','border_radius','animation','max_messages','fade_seconds','density','rainbow_mode','glow_enabled','glow_color']
    const patch:Object=Object.fromEntries(Object.entries(action.patch||{}).filter(([key])=>allowed.includes(key)))
    if(Object.keys(patch).length){const r=await admin.from('overlays').update(patch).eq('user_id',ownerId);if(r.error)throw r.error}
  }else if(type==='feature_config'){
    const key=String(action.feature_key||'');if(!key)return
    const existing=await admin.from('streamer_feature_configs').select('config').eq('owner_id',ownerId).eq('feature_key',key).maybeSingle();if(existing.error)throw existing.error
    const config={...(existing.data?.config||{}),...(action.patch||{})}
    const r=await admin.from('streamer_feature_configs').upsert({owner_id:ownerId,feature_key:key,config,updated_at:new Date().toISOString()},{onConflict:'owner_id,feature_key'});if(r.error)throw r.error
  }else if(type==='award_points'&&event.userId&&event.source){
    const identity=await admin.from('viewer_identities').select('viewer_id').eq('platform',event.source).eq('platform_user_id',event.userId).maybeSingle();if(identity.error)throw identity.error
    if(identity.data?.viewer_id){const account=await admin.from('loyalty_accounts').select('xp,level,balance').eq('owner_id',ownerId).eq('viewer_id',identity.data.viewer_id).maybeSingle();if(account.error)throw account.error;const delta=Math.max(-100000,Math.min(100000,Number(action.amount||0)||0));const r=await admin.from('loyalty_accounts').upsert({owner_id:ownerId,viewer_id:identity.data.viewer_id,xp:Number(account.data?.xp||0),level:Number(account.data?.level||1),balance:Math.max(0,Number(account.data?.balance||0)+delta),updated_at:new Date().toISOString()},{onConflict:'owner_id,viewer_id'});if(r.error)throw r.error}
  }else if(type==='audit'){
    await admin.from('audit_events').insert({owner_id:ownerId,actor_user_id:null,action:String(action.name||'automation.note'),target_type:'automation',target_id:null,metadata:{...action.metadata,event}})
  }
}
