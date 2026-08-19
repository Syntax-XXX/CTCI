import { unzipSync, strFromU8 } from 'fflate'

export const PLUGIN_API_VERSION = '1'
export const ALLOWED_PLUGIN_PERMISSIONS = new Set([
  'chat.read','commands.register','typography.write','theme.write','overlay.write','storage.read','storage.write','config.read','config.write','ui.render','events.subscribe','sounds.play'
])

const MAX_COMPRESSED_BYTES=10*1024*1024
const MAX_UNCOMPRESSED_BYTES=50*1024*1024
const MAX_ENTRY_BYTES=16*1024*1024
const MAX_FILES=500

export type PluginManifest = {
  id:string;name:string;version:string;author:string;description?:string;apiVersion:string;entry:string;permissions:string[]
  commands?:Array<{name:string;aliases?:string[];description?:string;permissions?:string[]}>
  configSchema?:Record<string,unknown>
}

export function inspectPluginZip(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_COMPRESSED_BYTES) throw new Error('Plugin package exceeds 10 MB')
  const preflight=preflightZip(bytes)
  if(preflight.entries<1||preflight.entries>MAX_FILES)throw new Error('Invalid plugin archive')
  if(preflight.uncompressedBytes>MAX_UNCOMPRESSED_BYTES)throw new Error('Plugin expands beyond the 50 MB safety limit')

  const files = unzipSync(bytes)
  const paths = Object.keys(files)
  if (!paths.length || paths.length > MAX_FILES) throw new Error('Invalid plugin archive')
  for (const path of paths) validatePath(path)

  let actualUncompressed=0
  for(const file of Object.values(files)){
    if(file.byteLength>MAX_ENTRY_BYTES)throw new Error('Plugin contains a file larger than the 16 MB safety limit')
    actualUncompressed+=file.byteLength
    if(actualUncompressed>MAX_UNCOMPRESSED_BYTES)throw new Error('Plugin expands beyond the 50 MB safety limit')
  }

  const manifestPath = paths.find(p => p === 'plugin.json' || p.endsWith('/plugin.json'))
  if (!manifestPath) throw new Error('plugin.json is required')
  if (files[manifestPath].byteLength > 256 * 1024) throw new Error('plugin.json is too large')
  let manifest: PluginManifest
  try { manifest = JSON.parse(strFromU8(files[manifestPath])) } catch { throw new Error('plugin.json contains invalid JSON') }
  validateManifest(manifest)

  const root = manifestPath.slice(0, -'plugin.json'.length)
  const entryPath = root + manifest.entry
  if (!files[entryPath]) throw new Error(`Plugin entry not found: ${manifest.entry}`)
  if (!manifest.entry.startsWith('dist/') || !manifest.entry.endsWith('.js')) throw new Error('Plugin entry must be a bundled JavaScript file under dist/')

  for (const path of paths) {
    const lower = path.toLowerCase()
    if (lower.includes('node_modules/') || lower.endsWith('.env') || lower.includes('/.env') || lower.endsWith('.pem') || lower.endsWith('.key')) throw new Error(`Prohibited file in plugin package: ${path}`)
  }
  return { manifest, fileCount: paths.length, uncompressedBytes: actualUncompressed }
}

function validateManifest(m:any): asserts m is PluginManifest {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Invalid plugin manifest')
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(m.id)) throw new Error('Invalid plugin id')
  if(typeof m.name!=='string'||!m.name.trim()||m.name.length>100)throw new Error('Invalid plugin name')
  if(typeof m.author!=='string'||!m.author.trim()||m.author.length>100)throw new Error('Invalid plugin author')
  if(typeof m.entry!=='string'||!m.entry.trim()||m.entry.length>180)throw new Error('Invalid plugin entry')
  if(m.description!==undefined&&(typeof m.description!=='string'||m.description.length>2000))throw new Error('Invalid plugin description')
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(m.version)) throw new Error('Version must be semantic versioning')
  if (m.apiVersion !== PLUGIN_API_VERSION) throw new Error(`Plugin API v${m.apiVersion} is incompatible; CTCI supports v${PLUGIN_API_VERSION}`)
  if (!Array.isArray(m.permissions)) throw new Error('permissions must be an array')
  if (m.permissions.length > 32) throw new Error('Too many plugin permissions')
  for (const permission of m.permissions) if (typeof permission !== 'string' || !ALLOWED_PLUGIN_PERMISSIONS.has(permission)) throw new Error(`Unsupported plugin permission: ${permission}`)
  if(m.commands!==undefined){
    if(!Array.isArray(m.commands)||m.commands.length>100)throw new Error('Invalid plugin commands')
    for(const command of m.commands){
      if(!command||typeof command!=='object'||typeof command.name!=='string'||!/^[a-z0-9][a-z0-9-]{0,31}$/.test(command.name))throw new Error('Invalid plugin command name')
      if(command.description!==undefined&&(typeof command.description!=='string'||command.description.length>240))throw new Error(`Invalid description for command ${command.name}`)
      if(command.aliases!==undefined){if(!Array.isArray(command.aliases)||command.aliases.length>20)throw new Error(`Invalid aliases for command ${command.name}`);for(const alias of command.aliases)if(typeof alias!=='string'||!/^[a-z0-9][a-z0-9-]{0,31}$/.test(alias))throw new Error(`Invalid alias for command ${command.name}`)}
      if(command.permissions!==undefined){if(!Array.isArray(command.permissions)||command.permissions.length>8)throw new Error(`Invalid permissions for command ${command.name}`);for(const permission of command.permissions)if(!['viewer','subscriber','vip','moderator','broadcaster'].includes(String(permission)))throw new Error(`Invalid command permission for ${command.name}`)}
    }
  }
}

function validatePath(path:string) {
  if (!path || path.length > 240 || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) throw new Error(`Unsafe archive path: ${path}`)
  const normalized=path.replace(/\\/g,'/')
  const parts=normalized.split('/')
  if (parts.some(part=>part==='..' || part==='.' || part.includes('\0'))) throw new Error(`Unsafe archive path: ${path}`)
}

function preflightZip(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  const min=Math.max(0,bytes.byteLength-65557)
  let eocd=-1
  for(let i=bytes.byteLength-22;i>=min;i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('Invalid ZIP: end-of-central-directory not found')
  const entries=view.getUint16(eocd+10,true)
  const centralSize=view.getUint32(eocd+12,true)
  const centralOffset=view.getUint32(eocd+16,true)
  if(entries===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error('ZIP64 plugin packages are not supported')
  if(entries>MAX_FILES||centralOffset+centralSize>bytes.byteLength)throw new Error('Invalid ZIP central directory')
  let offset=centralOffset,total=0
  for(let i=0;i<entries;i++){
    if(offset+46>bytes.byteLength||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid ZIP central directory entry')
    const uncompressed=view.getUint32(offset+24,true)
    if(uncompressed===0xffffffff)throw new Error('ZIP64 plugin entries are not supported')
    if(uncompressed>MAX_ENTRY_BYTES)throw new Error('Plugin contains a file larger than the 16 MB safety limit')
    total+=uncompressed
    if(total>MAX_UNCOMPRESSED_BYTES)throw new Error('Plugin expands beyond the 50 MB safety limit')
    const nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true)
    offset+=46+nameLength+extraLength+commentLength
  }
  return{entries,uncompressedBytes:total}
}
