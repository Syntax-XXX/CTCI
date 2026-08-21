import type { SupabaseClient } from '@supabase/supabase-js'
import { featureFlags } from '@/lib/features'

export type ChatFeatureInput={
  admin:SupabaseClient
  ownerId:string
  overlayId:string
  source:'twitch'|'youtube'
  eventId:string
  userId:string
  login:string
  displayName:string
  text:string
  commandPrefix:string
}

export type ChatFeatureResult={handled:boolean;reply?:string;suppressOverlay?:boolean;moderated?:boolean}

export async function processChatFeatures(input:ChatFeatureInput):Promise<ChatFeatureResult>{
  const flags=await featureFlags(input.admin,input.ownerId)
  const text=String(input.text||'').trim()
  if(!text)return{handled:false}

  if(flags.unified_moderation){
    const moderation=await moderate(input)
    if(moderation.blocked)return{handled:false,suppressOverlay:true,moderated:true}
  }

  const prefix=input.commandPrefix||'CC!'
  const isCommand=text.toLowerCase().startsWith(prefix.toLowerCase())
  if(!isCommand){
    if(flags.loyalty||flags.currency||flags.viewer_identity)await awardActivity(input,flags.loyalty===true,flags.currency===true)
    return{handled:false}
  }

  const body=text.slice(prefix.length).trim()
  const [rawCommand,...args]=body.split(/\s+/)
  const command=(rawCommand||'').toLowerCase()

  if(command==='vote'&&flags.cross_platform_polls){
    const option=Number(args[0])
    const{data:poll,error}=await input.admin.from('chat_polls').select('id,question,options').eq('owner_id',input.ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw error
    if(!poll)return{handled:true,reply:'There is no open poll.',suppressOverlay:true}
    const options=Array.isArray(poll.options)?poll.options:[]
    if(!Number.isInteger(option)||option<1||option>options.length)return{handled:true,reply:`Vote with ${prefix}vote 1-${options.length}.`,suppressOverlay:true}
    const{error:voteError}=await input.admin.from('chat_poll_votes').upsert({poll_id:poll.id,source:input.source,voter_id:input.userId,option_index:option-1},{onConflict:'poll_id,source,voter_id'})
    if(voteError)throw voteError
    return{handled:true,reply:`Vote recorded: ${options[option-1]}.`,suppressOverlay:true}
  }

  if(command==='join'&&flags.giveaways){
    const{data:giveaway,error}=await input.admin.from('giveaways').select('id,title').eq('owner_id',input.ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw error
    if(!giveaway)return{handled:true,reply:'There is no open giveaway.',suppressOverlay:true}
    const{error:entryError}=await input.admin.from('giveaway_entries').upsert({giveaway_id:giveaway.id,source:input.source,user_id:input.userId,display_name:input.displayName},{onConflict:'giveaway_id,source,user_id'})
    if(entryError)throw entryError
    return{handled:true,reply:`You joined “${giveaway.title}”.`,suppressOverlay:true}
  }

  if(command==='ask'&&flags.qna){
    const question=body.slice(rawCommand.length).trim().slice(0,500)
    if(!question)return{handled:true,reply:`Use ${prefix}ask your question`,suppressOverlay:true}
    const{error}=await input.admin.from('qna_items').upsert({owner_id:input.ownerId,source:input.source,user_id:input.userId,display_name:input.displayName,question,status:'pending',source_event_id:input.eventId},{onConflict:'owner_id,source_event_id',ignoreDuplicates:true})
    if(error)throw error
    return{handled:true,reply:'Question submitted.',suppressOverlay:true}
  }

  if(command==='predict'&&flags.predictions){
    const option=Number(args[0])
    const{data:prediction,error}=await input.admin.from('predictions').select('id,question,options').eq('owner_id',input.ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw error
    if(!prediction)return{handled:true,reply:'There is no open prediction.',suppressOverlay:true}
    const options=Array.isArray(prediction.options)?prediction.options:[]
    if(!Number.isInteger(option)||option<1||option>options.length)return{handled:true,reply:`Predict with ${prefix}predict 1-${options.length}.`,suppressOverlay:true}
    const{error:entryError}=await input.admin.from('prediction_entries').upsert({prediction_id:prediction.id,source:input.source,user_id:input.userId,display_name:input.displayName,option_index:option-1,amount:0},{onConflict:'prediction_id,source,user_id'})
    if(entryError)throw entryError
    return{handled:true,reply:`Prediction recorded: ${options[option-1]}.`,suppressOverlay:true}
  }

  if((command==='points'||command==='xp'||command==='level')&&(flags.loyalty||flags.currency)){
    const account=await getAccount(input)
    if(!account)return{handled:true,reply:'You have no activity points yet.',suppressOverlay:true}
    return{handled:true,reply:`Level ${account.level} · ${account.xp} XP · ${account.balance} points`,suppressOverlay:true}
  }

  return{handled:false}
}

async function awardActivity(input:ChatFeatureInput,awardXp:boolean,awardCurrency:boolean){
  const{error}=await input.admin.rpc('award_loyalty_event',{
    p_owner_id:input.ownerId,
    p_platform:input.source,
    p_platform_user_id:input.userId,
    p_platform_login:input.login,
    p_display_name:input.displayName,
    p_event_id:input.eventId,
    p_xp:awardXp?5:0,
    p_currency:awardCurrency?1:0,
  })
  if(error)throw error
}

async function getAccount(input:ChatFeatureInput){
  const{data:identity,error}=await input.admin.from('viewer_identities').select('viewer_id').eq('platform',input.source).eq('platform_user_id',input.userId).maybeSingle()
  if(error)throw error
  if(!identity)return null
  const{data:account,error:accountError}=await input.admin.from('loyalty_accounts').select('xp,level,balance').eq('owner_id',input.ownerId).eq('viewer_id',identity.viewer_id).maybeSingle()
  if(accountError)throw accountError
  return account
}

async function moderate(input:ChatFeatureInput){
  const{data:rules,error}=await input.admin.from('moderation_rules').select('id,name,rule_type,config,action').eq('owner_id',input.ownerId).eq('enabled',true)
  if(error)throw error
  const text=input.text
  for(const rule of rules||[]){
    const config=rule.config&&typeof rule.config==='object'?rule.config as any:{}
    let matched=false
    if(rule.rule_type==='keyword'){
      const terms=Array.isArray(config.terms)?config.terms.map((x:any)=>String(x).toLowerCase()).filter(Boolean):[]
      matched=terms.some((term:string)=>text.toLowerCase().includes(term))
    }else if(rule.rule_type==='link'){
      const urls=text.match(/https?:\/\/[^\s]+/gi)||[]
      const allowed=Array.isArray(config.allowDomains)?config.allowDomains.map((x:any)=>String(x).toLowerCase()):[]
      matched=urls.some(url=>{try{const host=new URL(url).hostname.toLowerCase();return !allowed.some((domain:string)=>host===domain||host.endsWith('.'+domain))}catch{return true}})
    }else if(rule.rule_type==='caps'){
      const letters=text.match(/[A-Za-z]/g)||[],upper=text.match(/[A-Z]/g)||[]
      matched=letters.length>=Number(config.minLength||12)&&upper.length/Math.max(1,letters.length)>=Number(config.maxRatio||0.8)
    }
    if(!matched)continue
    const action=rule.action&&typeof rule.action==='object'?rule.action as any:{}
    const actionName=String(action.type||'hide')
    await input.admin.from('moderation_actions').insert({owner_id:input.ownerId,source:input.source,target_user_id:input.userId,target_name:input.displayName,action:actionName,reason:String(rule.name||rule.rule_type),metadata:{event_id:input.eventId,rule_id:rule.id}})
    if(['hide','drop','block'].includes(actionName))return{blocked:true}
  }
  return{blocked:false}
}
