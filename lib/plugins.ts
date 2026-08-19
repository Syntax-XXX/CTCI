import { unzipSync, strFromU8 } from 'fflate'

export const PLUGIN_API_VERSION = '1'
export const ALLOWED_PLUGIN_PERMISSIONS = new Set([
  'chat.read','commands.register','typography.write','theme.write','overlay.write','storage.read','storage.write','config.read','config.write','ui.render','events.subscribe','sounds.play'
])

export type PluginManifest = {
  id:string;name:string;version:string;author:string;description?:string;apiVersion:string;entry:string;permissions:string[]
  commands?:Array<{name:string;aliases?:string[];description?:string;permissions?:string[]}>
  configSchema?:Record<string,unknown>
}

export function inspectPluginZip(bytes: Uint8Array) {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('Plugin package exceeds 10 MB')
  const files = unzipSync(bytes)
  const paths = Object.keys(files)
  if (!paths.length || paths.length > 500) throw new Error('Invalid plugin archive')
  for (const path of paths) validatePath(path)

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
  return { manifest, fileCount: paths.length, uncompressedBytes: Object.values(files).reduce((n,v)=>n+v.byteLength,0) }
}

function validateManifest(m:any): asserts m is PluginManifest {
  if (!m || typeof m !== 'object') throw new Error('Invalid plugin manifest')
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(m.id)) throw new Error('Invalid plugin id')
  for (const key of ['name','author','entry']) if (typeof m[key] !== 'string' || !m[key].trim()) throw new Error(`Missing ${key}`)
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(m.version)) throw new Error('Version must be semantic versioning')
  if (m.apiVersion !== PLUGIN_API_VERSION) throw new Error(`Plugin API v${m.apiVersion} is incompatible; CTCI supports v${PLUGIN_API_VERSION}`)
  if (!Array.isArray(m.permissions)) throw new Error('permissions must be an array')
  for (const permission of m.permissions) if (typeof permission !== 'string' || !ALLOWED_PLUGIN_PERMISSIONS.has(permission)) throw new Error(`Unsupported plugin permission: ${permission}`)
  if (m.permissions.length > 32) throw new Error('Too many plugin permissions')
}

function validatePath(path:string) {
  if (!path || path.length > 240 || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) throw new Error(`Unsafe archive path: ${path}`)
  const normalized=path.replace(/\\/g,'/')
  const parts=normalized.split('/')
  if (parts.some(part=>part==='..' || part==='.' || part.includes('\0'))) throw new Error(`Unsafe archive path: ${path}`)
}
