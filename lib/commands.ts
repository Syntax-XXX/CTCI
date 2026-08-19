import type { SupabaseClient } from '@supabase/supabase-js'

export type CommandPermission = 'broadcaster' | 'moderator' | 'vip' | 'subscriber' | 'viewer'
export type ParsedCommand = { prefix:string; command:string; args:string[]; rawArgs:string; raw:string }
export type CommandActor = { twitchUserId:string; login:string; roles:Set<CommandPermission> }
export type CommandContext = { admin:SupabaseClient; ownerId:string; channelTwitchUserId:string; actor:CommandActor; parsed:ParsedCommand }
export type ChatCommand = {
  name:string; aliases?:string[]; description:string; source:'core'|'plugin'; pluginId?:string;
  permissions:CommandPermission[]; cooldown?:{globalSeconds?:number;userSeconds?:number};
  handler:(ctx:CommandContext)=>Promise<{message?:string;changed?:Record<string,unknown>}>
}

const registry=new Map<string,ChatCommand>()

export function registerCommand(command:ChatCommand){
  const keys=[command.name,...(command.aliases||[])].map(v=>v.toLowerCase())
  for(const key of keys){const existing=registry.get(key);if(existing&&existing.source==='core'&&command.source==='plugin')throw new Error(`Plugin command cannot override built-in command: ${key}`)}
  keys.forEach(key=>registry.set(key,command))
}
export function unregisterPluginCommands(pluginId:string){for(const [key,value] of registry.entries())if(value.source==='plugin'&&value.pluginId===pluginId)registry.delete(key)}
export function listCommands(){return [...new Map([...registry.values()].map(c=>[c.name,c])).values()]}

export function parseCommand(message:string,prefix:string):ParsedCommand|null{
  if(!message.toLowerCase().startsWith(prefix.toLowerCase()))return null
  const body=message.slice(prefix.length).trim();if(!body||body.length>500)return null
  const tokens=tokenize(body);if(!tokens.length)return null
  const [command,...args]=tokens;return {prefix,command:command.toLowerCase(),args,rawArgs:body.slice(command.length).trim(),raw:message}
}
function tokenize(input:string){const out:string[]=[];let current='';let quote:'"'|"'"|null=null;let escape=false;for(const ch of input){if(escape){current+=ch;escape=false;continue}if(ch==='\\'){escape=true;continue}if(quote){if(ch===quote)quote=null;else current+=ch;continue}if(ch==='"'||ch==="'"){quote=ch;continue}if(/\s/.test(ch)){if(current){out.push(current);current=''}continue}current+=ch}if(quote)throw new Error('Unclosed quoted argument');if(current)out.push(current);return out}

export async function executeCommand(ctx:CommandContext){
  const command=registry.get(ctx.parsed.command);if(!command)return {handled:false as const}
  const {data:config}=await ctx.admin.from('command_configurations').select('*').eq('owner_id',ctx.ownerId).eq('command_name',command.name).maybeSingle()
  if(config?.enabled===false)return audit(ctx,command,false,'disabled')
  const allowed=(config?.permissions?.length?config.permissions:command.permissions) as CommandPermission[]
  if(!allowed.some(role=>ctx.actor.roles.has(role)))return audit(ctx,command,false,'forbidden')

  const globalSeconds=config?.global_cooldown_seconds??command.cooldown?.globalSeconds??1
  const userSeconds=config?.user_cooldown_seconds??command.cooldown?.userSeconds??5
  const {data:cooldownAllowed,error:cooldownError}=await ctx.admin.rpc('try_command_cooldown',{
    p_owner_id:ctx.ownerId,p_command_name:command.name,p_twitch_user_id:ctx.actor.twitchUserId,p_global_seconds:globalSeconds,p_user_seconds:userSeconds,
  })
  if(cooldownError)throw cooldownError
  if(!cooldownAllowed)return audit(ctx,command,false,'cooldown')

  try{
    const result=await command.handler(ctx)
    if(config){
      await ctx.admin.from('command_configurations').update({usage_count:Number(config.usage_count||0)+1,last_used_at:new Date().toISOString()}).eq('id',config.id)
    }else{
      await ctx.admin.from('command_configurations').insert({owner_id:ctx.ownerId,command_name:command.name,aliases:command.aliases||[],permissions:command.permissions,source:command.source,plugin_id:command.pluginId||null,usage_count:1,last_used_at:new Date().toISOString()})
    }
    await audit(ctx,command,true,null)
    return {handled:true as const,success:true,...result}
  }catch(error){await audit(ctx,command,false,error instanceof Error?error.message.slice(0,80):'handler_error');return {handled:true as const,success:false}}
}

async function audit(ctx:CommandContext,command:ChatCommand,success:boolean,errorCode:string|null){
  await ctx.admin.from('command_audit_log').insert({owner_id:ctx.ownerId,channel_twitch_user_id:ctx.channelTwitchUserId,twitch_user_id:ctx.actor.twitchUserId,twitch_login:ctx.actor.login,command_name:command.name,raw_command:ctx.parsed.raw.slice(0,500),sanitized_args:ctx.parsed.args.slice(0,20),source:command.source,plugin_id:command.pluginId||null,success,error_code:errorCode})
  return {handled:true as const,success}
}
function requireHexOrTransparent(value:string){if(value==='transparent')return value;if(!/^#[0-9a-f]{6}$/i.test(value))throw new Error('invalid_color');return value}
async function updateOverlay(ctx:CommandContext,patch:Record<string,unknown>){const {error}=await ctx.admin.from('overlays').update(patch).eq('user_id',ctx.ownerId);if(error)throw error;return {changed:patch}}

registerCommand({name:'font',description:'Change message font',source:'core',permissions:['broadcaster'],handler:async c=>{const font=c.parsed.rawArgs.trim();if(!font||font.length>80)throw new Error('invalid_font');return updateOverlay(c,{font_family:font})}})
registerCommand({name:'fontsize',aliases:['fs'],description:'Change message font size',source:'core',permissions:['broadcaster'],handler:async c=>{const size=Number(c.parsed.args[0]);if(!Number.isInteger(size)||size<10||size>96)throw new Error('invalid_size');return updateOverlay(c,{font_size:size})}})
registerCommand({name:'color',aliases:['colour'],description:'Change message color',source:'core',permissions:['broadcaster','moderator'],handler:async c=>updateOverlay(c,{message_color:requireHexOrTransparent((c.parsed.args[0]||'').toLowerCase())})})
registerCommand({name:'namecolor',description:'Change username color',source:'core',permissions:['broadcaster'],handler:async c=>updateOverlay(c,{username_color:requireHexOrTransparent((c.parsed.args[0]||'').toLowerCase())})})
registerCommand({name:'background',aliases:['bg'],description:'Change overlay background',source:'core',permissions:['broadcaster'],handler:async c=>{const value=requireHexOrTransparent((c.parsed.args[0]||'').toLowerCase());return updateOverlay(c,value==='transparent'?{background_opacity:0}:{background_color:value,background_opacity:1})}})
registerCommand({name:'opacity',description:'Change overlay opacity',source:'core',permissions:['broadcaster'],handler:async c=>{const value=Number(c.parsed.args[0]);if(!Number.isFinite(value)||value<0||value>1)throw new Error('invalid_opacity');return updateOverlay(c,{background_opacity:value})}})
registerCommand({name:'animation',aliases:['anim'],description:'Change chat animation',source:'core',permissions:['broadcaster'],handler:async c=>{const value=(c.parsed.args[0]||'').toLowerCase();if(!['fade','slide','pop','none'].includes(value))throw new Error('invalid_animation');return updateOverlay(c,{animation:value})}})
registerCommand({name:'maxmessages',description:'Change maximum visible messages',source:'core',permissions:['broadcaster'],handler:async c=>{const value=Number(c.parsed.args[0]);if(!Number.isInteger(value)||value<1||value>100)throw new Error('invalid_maxmessages');return updateOverlay(c,{max_messages:value})}})
registerCommand({name:'lifetime',description:'Change message lifetime',source:'core',permissions:['broadcaster'],handler:async c=>{const raw=(c.parsed.args[0]||'').toLowerCase();const value=raw==='off'?0:Number(raw);if(!Number.isInteger(value)||value<0||value>300)throw new Error('invalid_lifetime');return updateOverlay(c,{fade_seconds:value})}})
registerCommand({name:'reset',description:'Reset appearance',source:'core',permissions:['broadcaster'],cooldown:{globalSeconds:5,userSeconds:5},handler:async c=>updateOverlay(c,{font_family:'Inter',font_size:24,font_weight:600,message_spacing:10,username_color:'#A970FF',message_color:'#F4F4F5',background_color:'#0B0B10',background_opacity:.72,bubble_color:'#18181B',bubble_opacity:.78,border_radius:16,animation:'slide',max_messages:12,fade_seconds:35})})
registerCommand({name:'help',description:'List commands',source:'core',permissions:['viewer','subscriber','vip','moderator','broadcaster'],cooldown:{globalSeconds:2,userSeconds:10},handler:async c=>{const requested=c.parsed.args[0]?.toLowerCase();const commands=listCommands();const found=requested?commands.find(x=>x.name===requested||x.aliases?.includes(requested)):null;return {message:found?`${c.parsed.prefix}${found.name} — ${found.description}`:`Commands: ${commands.map(x=>c.parsed.prefix+x.name).join(', ')}`}}})
registerCommand({name:'plugins',description:'List enabled plugins',source:'core',permissions:['viewer','subscriber','vip','moderator','broadcaster'],handler:async c=>{const {data}=await c.admin.from('plugin_installations').select('plugin_id').eq('owner_id',c.ownerId).eq('enabled',true);return {message:data?.length?`Enabled plugins: ${data.map(x=>x.plugin_id).join(', ')}`:'No plugins enabled.'}})
