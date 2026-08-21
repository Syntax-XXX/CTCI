import { isFeatureEnabled } from '@/lib/features'

type Source='twitch'|'youtube'|'discord'
type Actor={source:Source;userId:string;login:string;displayName:string;roles?:string[]}
type Result={handled:boolean;message?:string}

export async function ensureViewer(admin:any,actor:Actor){
  let identity=await admin.from('viewer_identities').select('viewer_id').eq('platform',actor.source).eq('platform_user_id',actor.userId).maybeSingle()
  if(identity.error)throw identity.error
  if(identity.data?.viewer_id){
    await admin.from('viewer_profiles').update({display_name:actor.displayName}).eq('id',identity.data.viewer_id)
    await admin.from('viewer_identities').update({platform_login:actor.login}).eq('platform',actor.source).eq('platform_user_id',actor.userId)
    return String(identity.data.viewer_id)
  }
  const profile=await admin.from('viewer_profiles').insert({display_name:actor.displayName}).select('id').single()
  if(profile.error)throw profile.error
  const link=await admin.from('viewer_identities').insert({viewer_id:profile.data.id,platform:actor.source,platform_user_id:actor.userId,platform_login:actor.login,verified_at:new Date().toISOString()})
  if(link.error){
    if(link.error.code==='23505'){
      await admin.from('viewer_profiles').delete().eq('id',profile.data.id)
      identity=await admin.from('viewer_identities').select('viewer_id').eq('platform',actor.source).eq('platform_user_id',actor.userId).single()
      if(identity.error)throw identity.error
      return String(identity.data.viewer_id)
    }
    throw link.error
  }
  return String(profile.data.id)
}

export async function awardActivity(admin:any,ownerId:string,actor:Actor){
  const loyalty=await isFeatureEnabled(admin,ownerId,'loyalty')
  const currency=await isFeatureEnabled(admin,ownerId,'currency')
  if(!loyalty&&!currency)return
  const viewerId=await ensureViewer(admin,actor)
  const existing=await admin.from('loyalty_accounts').select('xp,level,balance,updated_at').eq('owner_id',ownerId).eq('viewer_id',viewerId).maybeSingle()
  if(existing.error)throw existing.error
  const last=existing.data?.updated_at?Date.parse(existing.data.updated_at):0
  if(Date.now()-last<12_000)return
  const xpDelta=loyalty?5:0,currencyDelta=currency?1:0
  const nextXp=Math.max(0,Number(existing.data?.xp||0)+xpDelta)
  const nextBalance=Math.max(0,Number(existing.data?.balance||0)+currencyDelta)
  const level=Math.max(1,Math.floor(Math.sqrt(nextXp)/10)+1)
  const saved=await admin.from('loyalty_accounts').upsert({owner_id:ownerId,viewer_id:viewerId,xp:nextXp,level,balance:nextBalance,updated_at:new Date().toISOString()},{onConflict:'owner_id,viewer_id'})
  if(saved.error)throw saved.error
  const tx=await admin.from('loyalty_transactions').insert({owner_id:ownerId,viewer_id:viewerId,kind:'chat_activity',xp_delta:xpDelta,currency_delta:currencyDelta,metadata:{source:actor.source}})
  if(tx.error)throw tx.error
}

export async function handleEngagementCommand(admin:any,ownerId:string,actor:Actor,text:string,prefix='CC!'):Promise<Result>{
  if(!text.toLowerCase().startsWith(prefix.toLowerCase()))return{handled:false}
  const body=text.slice(prefix.length).trim(),[raw,...args]=body.split(/\s+/),command=(raw||'').toLowerCase()
  if(!command)return{handled:false}

  if(await isFeatureEnabled(admin,ownerId,'custom_commands')){
    let cfg=await admin.from('command_configurations').select('*').eq('owner_id',ownerId).eq('source','custom').eq('command_name',command).maybeSingle()
    if(cfg.error)throw cfg.error
    if(!cfg.data){cfg=await admin.from('command_configurations').select('*').eq('owner_id',ownerId).eq('source','custom').contains('aliases',[command]).maybeSingle();if(cfg.error)throw cfg.error}
    if(cfg.data&&cfg.data.enabled!==false){
      const roles=new Set(['viewer',...(actor.roles||[])]),allowed=Array.isArray(cfg.data.permissions)&&cfg.data.permissions.length?cfg.data.permissions:['viewer']
      if(!allowed.some((r:string)=>roles.has(r)))return{handled:true,message:'You do not have permission to use that command.'}
      const cooldown=await admin.rpc('try_command_cooldown',{p_owner_id:ownerId,p_command_name:String(cfg.data.command_name),p_twitch_user_id:actor.userId,p_global_seconds:Number(cfg.data.global_cooldown_seconds||1),p_user_seconds:Number(cfg.data.user_cooldown_seconds||5)})
      if(cooldown.error)throw cooldown.error
      if(!cooldown.data)return{handled:true}
      const message=await renderTemplate(admin,ownerId,actor,String(cfg.data.response_template||''),args)
      await admin.from('command_configurations').update({usage_count:Number(cfg.data.usage_count||0)+1,last_used_at:new Date().toISOString()}).eq('id',cfg.data.id)
      await admin.from('audit_events').insert({owner_id:ownerId,actor_user_id:null,action:'command.custom.execute',target_type:'command',target_id:String(cfg.data.command_name),metadata:{source:actor.source,user_id:actor.userId}})
      return{handled:true,message:message.slice(0,500)}
    }
  }

  if(command==='vote'&&await isFeatureEnabled(admin,ownerId,'cross_platform_polls')){
    const poll=await admin.from('chat_polls').select('id,question,options').eq('owner_id',ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(poll.error)throw poll.error
    if(!poll.data)return{handled:true,message:'No poll is open.'}
    const option=Number(args[0])-1,options=Array.isArray(poll.data.options)?poll.data.options:[]
    if(!Number.isInteger(option)||option<0||option>=options.length)return{handled:true,message:`Vote with ${prefix}vote 1-${options.length}`}
    const vote=await admin.from('chat_poll_votes').upsert({poll_id:poll.data.id,source:actor.source,voter_id:actor.userId,option_index:option,created_at:new Date().toISOString()},{onConflict:'poll_id,source,voter_id'})
    if(vote.error)throw vote.error
    return{handled:true,message:`Vote recorded: ${options[option]}`}
  }

  if(command==='join'&&await isFeatureEnabled(admin,ownerId,'giveaways')){
    const giveaway=await admin.from('giveaways').select('id,title').eq('owner_id',ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(giveaway.error)throw giveaway.error
    if(!giveaway.data)return{handled:true,message:'No giveaway is open.'}
    const entry=await admin.from('giveaway_entries').upsert({giveaway_id:giveaway.data.id,source:actor.source,user_id:actor.userId,display_name:actor.displayName},{onConflict:'giveaway_id,source,user_id'})
    if(entry.error)throw entry.error
    return{handled:true,message:`${actor.displayName} joined ${giveaway.data.title}.`}
  }

  if(command==='ask'&&await isFeatureEnabled(admin,ownerId,'qna')){
    const question=args.join(' ').trim().slice(0,500)
    if(!question)return{handled:true,message:`Usage: ${prefix}ask your question`}
    const row=await admin.from('qna_items').insert({owner_id:ownerId,source:actor.source,user_id:actor.userId,display_name:actor.displayName,question,status:'pending'})
    if(row.error)throw row.error
    return{handled:true,message:'Question added to the Q&A queue.'}
  }

  if((command==='points'||command==='xp')&&(await isFeatureEnabled(admin,ownerId,'loyalty')||await isFeatureEnabled(admin,ownerId,'currency'))){
    const viewerId=await ensureViewer(admin,actor)
    const account=await admin.from('loyalty_accounts').select('xp,level,balance').eq('owner_id',ownerId).eq('viewer_id',viewerId).maybeSingle()
    if(account.error)throw account.error
    return{handled:true,message:`${actor.displayName}: level ${account.data?.level||1} · ${account.data?.xp||0} XP · ${account.data?.balance||0} points`}
  }

  if(command==='redeem'&&await isFeatureEnabled(admin,ownerId,'reward_store')){
    const query=args.join(' ').trim().toLowerCase();if(!query)return{handled:true,message:`Usage: ${prefix}redeem reward name`}
    const items=await admin.from('reward_store_items').select('id,name,cost,action').eq('owner_id',ownerId).eq('enabled',true);if(items.error)throw items.error
    const item=(items.data||[]).find((x:any)=>String(x.name).toLowerCase()===query);if(!item)return{handled:true,message:'Reward not found.'}
    const viewerId=await ensureViewer(admin,actor),account=await admin.from('loyalty_accounts').select('xp,level,balance').eq('owner_id',ownerId).eq('viewer_id',viewerId).maybeSingle();if(account.error)throw account.error
    const balance=Number(account.data?.balance||0),cost=Number(item.cost||0);if(balance<cost)return{handled:true,message:`Not enough points. Need ${cost}, you have ${balance}.`}
    const save=await admin.from('loyalty_accounts').upsert({owner_id:ownerId,viewer_id:viewerId,xp:Number(account.data?.xp||0),level:Number(account.data?.level||1),balance:balance-cost,updated_at:new Date().toISOString()},{onConflict:'owner_id,viewer_id'});if(save.error)throw save.error
    const redemption=await admin.from('reward_redemptions').insert({owner_id:ownerId,item_id:item.id,viewer_id:viewerId,cost,status:'fulfilled',metadata:{action:item.action,source:actor.source}});if(redemption.error)throw redemption.error
    await admin.from('loyalty_transactions').insert({owner_id:ownerId,viewer_id:viewerId,kind:'reward_redeem',xp_delta:0,currency_delta:-cost,metadata:{item_id:item.id,name:item.name}})
    return{handled:true,message:`Redeemed ${item.name} for ${cost} points.`}
  }

  if(command==='predict'&&await isFeatureEnabled(admin,ownerId,'predictions')){
    const prediction=await admin.from('predictions').select('id,question,options').eq('owner_id',ownerId).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(prediction.error)throw prediction.error
    if(!prediction.data)return{handled:true,message:'No prediction is open.'}
    const option=Number(args[0])-1,options=Array.isArray(prediction.data.options)?prediction.data.options:[]
    if(!Number.isInteger(option)||option<0||option>=options.length)return{handled:true,message:`Predict with ${prefix}predict 1-${options.length}`}
    const amount=Math.max(0,Math.min(1_000_000,Number(args[1]||0)||0))
    const row=await admin.from('prediction_entries').upsert({prediction_id:prediction.data.id,source:actor.source,user_id:actor.userId,display_name:actor.displayName,option_index:option,amount},{onConflict:'prediction_id,source,user_id'})
    if(row.error)throw row.error
    return{handled:true,message:`Prediction recorded: ${options[option]}`}
  }

  if(command==='roll'&&await isFeatureEnabled(admin,ownerId,'chat_games')){
    const sides=Math.max(2,Math.min(1000,Number(args[0]||100)||100)),value=1+Math.floor(Math.random()*sides)
    const row=await admin.from('chat_game_sessions').insert({owner_id:ownerId,game_type:'roll',status:'closed',state:{source:actor.source,userId:actor.userId,displayName:actor.displayName,sides,value},closed_at:new Date().toISOString()});if(row.error)throw row.error
    return{handled:true,message:`${actor.displayName} rolled ${value}/${sides}.`}
  }

  return{handled:false}
}

async function renderTemplate(admin:any,ownerId:string,actor:Actor,template:string,args:string[]){
  let points=0,level=1
  if(template.includes('{points}')||template.includes('{level}')){const viewerId=await ensureViewer(admin,actor),r=await admin.from('loyalty_accounts').select('balance,level').eq('owner_id',ownerId).eq('viewer_id',viewerId).maybeSingle();if(r.error)throw r.error;points=Number(r.data?.balance||0);level=Number(r.data?.level||1)}
  let uptime='offline';if(template.includes('{uptime}')){const s=await admin.from('stream_sessions').select('started_at,ended_at').eq('owner_id',ownerId).is('ended_at',null).order('started_at',{ascending:false}).limit(1).maybeSingle();if(s.error)throw s.error;if(s.data?.started_at){const mins=Math.max(0,Math.floor((Date.now()-Date.parse(s.data.started_at))/60000));uptime=`${Math.floor(mins/60)}h ${mins%60}m`}}
  const values:Record<string,string>={user:actor.login,display_name:actor.displayName,platform:actor.source,points:String(points),level:String(level),uptime,viewer_count:'n/a',random_1_100:String(1+Math.floor(Math.random()*100)),args:args.join(' ')}
  return template.replace(/\{([a-z0-9_]+)\}/gi,(full,key)=>key in values?values[key]:full)
}
