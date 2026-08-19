import { NextResponse } from 'next/server'
import { ALLOWED_PLUGIN_PERMISSIONS, PLUGIN_API_VERSION } from '@/lib/plugins'

export async function GET(){
  return NextResponse.json({
    name:'CTCI Plugin API',
    apiVersion:PLUGIN_API_VERSION,
    packageFormat:'zip',
    maxPackageBytes:10*1024*1024,
    entryRule:'Bundled JavaScript file under dist/ ending in .js',
    manifest:{
      file:'plugin.json',
      required:['id','name','version','author','apiVersion','entry','permissions'],
      schema:{
        id:'lowercase slug: /^[a-z0-9][a-z0-9-]{1,62}$/',
        name:'string',
        version:'semantic version, e.g. 1.0.0',
        author:'string',
        description:'optional string',
        apiVersion:PLUGIN_API_VERSION,
        entry:'dist/index.js',
        permissions:'array of capabilities',
        commands:'optional array of {name, aliases?, description?, permissions?}',
        configSchema:'optional JSON object'
      }
    },
    capabilities:[...ALLOWED_PLUGIN_PERMISSIONS],
    security:{
      prohibited:['eval','vm2','arbitrary require','direct filesystem access','process/env access','direct database access','direct OAuth token access','cross-streamer data access'],
      archiveRules:['No absolute paths','No .. path traversal','No node_modules','No .env/.pem/.key files','Maximum 500 archive entries'],
      execution:'Installed packages remain non-executable until a CTCI isolated runtime supports their declared capabilities.'
    },
    packageLayout:['plugin.json','dist/index.js'],
    exampleManifest:{id:'hello-chat',name:'Hello Chat',version:'1.0.0',author:'Example Developer',description:'Adds a hello command.',apiVersion:PLUGIN_API_VERSION,entry:'dist/index.js',permissions:['commands.register'],commands:[{name:'hello',description:'Say hello',permissions:['viewer']}]},
    exampleEntry:"import { definePlugin } from '@ctci/plugin-sdk'\n\nexport default definePlugin({\n  id: 'hello-chat',\n  apiVersion: '1',\n  async onLoad(ctx) {\n    ctx.commands.register({\n      name: 'hello',\n      description: 'Say hello',\n      permissions: ['viewer'],\n      async handler() { return { message: 'Hello from CTCI!' } }\n    })\n  }\n})",
    docs:'/docs/plugins',
    marketplace:'/dashboard/plugins'
  })
}
