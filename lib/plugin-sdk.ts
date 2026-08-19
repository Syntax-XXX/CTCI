import type { ChatCommand } from '@/lib/commands'

export type PluginCapability =
  | 'chat.read' | 'commands.register' | 'typography.write' | 'theme.write'
  | 'overlay.write' | 'storage.read' | 'storage.write' | 'config.read'
  | 'config.write' | 'ui.render' | 'events.subscribe' | 'sounds.play'

export type PluginSettingField = {
  key:string
  label:string
  description?:string
  type:'text'|'number'|'boolean'|'color'|'select'
  default?:string|number|boolean
  min?:number
  max?:number
  step?:number
  options?:Array<{label:string;value:string}>
}

export type PluginDashboardBlock =
  | {type:'heading';text:string;level?:2|3|4}
  | {type:'text';text:string}
  | {type:'stat';label:string;value:string}
  | {type:'badge';text:string}
  | {type:'image';src:string;alt?:string}
  | {type:'link';label:string;href:string;variant?:'primary'|'secondary'}
  | {type:'progress';label?:string;value:number;max?:number}
  | {type:'divider'}

export type PluginDashboardCard = {
  id:string
  title:string
  description?:string
  placement?:'overview'|'plugins'|'commands'|'badges'
  blocks?:PluginDashboardBlock[]
  settings?:PluginSettingField[]
}

export type PluginOverlayWidget = {
  id:string
  type:'text'|'image'|'box'|'progress'
  text?:string
  src?:string
  x?:number
  y?:number
  width?:number
  height?:number
  opacity?:number
  color?:string
  background?:string
  fontSize?:number
  borderRadius?:number
  value?:number
  max?:number
  zIndex?:number
}

export type PluginUIContributions = {
  dashboard?:PluginDashboardCard[]
  overlay?:PluginOverlayWidget[]
}

export type PluginDefinition = {
  id: string
  apiVersion: '1'
  onLoad?: (ctx: PluginContext) => void | Promise<void>
  onUnload?: (ctx: PluginContext) => void | Promise<void>
}

export type PluginContext = {
  commands: { register(command: Omit<ChatCommand,'source'|'pluginId'>): void }
  storage: { get<T=unknown>(key:string):Promise<T|null>;set(key:string,value:unknown):Promise<void> }
  config: { get<T=unknown>(key:string):Promise<T|null> }
  typography: { setGlobalStyle(patch:Record<string,unknown>):Promise<void> }
  overlay: { update(patch:Record<string,unknown>):Promise<void> }
  log: { info(message:string,meta?:unknown):void;warn(message:string,meta?:unknown):void }
}

export function definePlugin<T extends PluginDefinition>(plugin:T):T{return plugin}

export function requireCapability(grants:Set<string>,capability:PluginCapability){
  if(!grants.has(capability))throw new Error(`Plugin capability not granted: ${capability}`)
}
