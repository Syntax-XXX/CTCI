import { isFeatureEnabled } from '@/lib/features'

type ModerationInput={ownerId:string;source:'twitch'|'youtube';userId:string;displayName:string;text:string}
export type ModerationDecision={blocked:boolean;flagged:boolean;reason?:string;action?:string}

export async function evaluateModeration(admin:any,input:ModerationInput):Promise<ModerationDecision>{
  if(!await isFeatureEnabled(admin,input.ownerId,'unified_moderation'))return{blocked:false,flagged:false}
  const rules=await admin.from('moderation_rules').select('id,name,rule_type,config,action').eq('owner_id',input.ownerId).eq('enabled',true)
  if(rules.error)throw rules.error
  const text=input.text||'',lower=text.toLowerCase()
  for(const rule of rules.data||[]){
    const config=rule.config&&typeof rule.config==='object'?rule.config:{},action=rule.action&&typeof rule.action==='object'?rule.action:{}
    let matched=false,reason=''
    if(rule.rule_type==='blocked_words'){
      const words=Array.isArray(config.words)?config.words.map((x:any)=>String(x).trim().toLowerCase()).filter(Boolean):[]
      const hit=words.find((word:string)=>lower.includes(word));if(hit){matched=true;reason=`blocked word: ${hit}`}
    }else if(rule.rule_type==='links'){
      const hasLink=/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gg|io|dev|tv|me|co)\b/i.test(text)
      const allow=Array.isArray(config.allowed_domains)?config.allowed_domains.map((x:any)=>String(x).toLowerCase()):[]
      if(hasLink&&(!allow.length||!allow.some((d:string)=>lower.includes(d)))){matched=true;reason='link filter'}
    }else if(rule.rule_type==='caps'){
      const letters=(text.match(/[A-Za-z]/g)||[]),caps=(text.match(/[A-Z]/g)||[]),min=Number(config.min_length||12),ratio=Number(config.ratio||0.75)
      if(letters.length>=min&&caps.length/Math.max(1,letters.length)>=ratio){matched=true;reason='excessive caps'}
    }else if(rule.rule_type==='length'){
      const max=Math.max(20,Math.min(2000,Number(config.max||500)));if(text.length>max){matched=true;reason=`message longer than ${max}`}
    }else if(rule.rule_type==='repeated_text'){
      const seconds=Math.max(2,Math.min(120,Number(config.window_seconds||20))),cutoff=new Date(Date.now()-seconds*1000).toISOString()
      const recent=await admin.from('chat_events').select('message_text').eq('source',input.source).eq('chatter_user_id',input.userId).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(3)
      if(recent.error)throw recent.error
      if((recent.data||[]).some((row:any)=>String(row.message_text||'').trim().toLowerCase()===lower.trim())){matched=true;reason='repeated message'}
    }else if(rule.rule_type==='rate'){
      const seconds=Math.max(2,Math.min(120,Number(config.window_seconds||10))),max=Math.max(2,Math.min(30,Number(config.max_messages||6))),cutoff=new Date(Date.now()-seconds*1000).toISOString()
      const recent=await admin.from('chat_events').select('id',{count:'exact',head:true}).eq('source',input.source).eq('chatter_user_id',input.userId).gte('created_at',cutoff)
      if(recent.error)throw recent.error
      if((recent.count||0)>=max){matched=true;reason='message rate limit'}
    }
    if(!matched)continue
    const kind=String(action.type||'hide')
    await admin.from('moderation_actions').insert({owner_id:input.ownerId,source:input.source,target_user_id:input.userId,target_name:input.displayName,action:kind,reason,metadata:{rule_id:rule.id,rule_name:rule.name}})
    return{blocked:kind==='hide'||kind==='block',flagged:kind==='flag',reason,action:kind}
  }
  return{blocked:false,flagged:false}
}
