import type { ChatCommand } from '@/lib/commands'

export type PluginCapability =
  | 'chat.read' | 'commands.register' | 'typography.write' | 'theme.write'
  | 'overlay.write' | 'storage.read' | 'storage.write' | 'config.read'
  | 'config.write' | 'ui.render' | 'events.subscribe' | 'sounds.play'

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
