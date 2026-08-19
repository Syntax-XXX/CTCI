import { NextResponse } from 'next/server'
import { ALLOWED_PLUGIN_PERMISSIONS, PLUGIN_API_VERSION } from '@/lib/plugins'

export async function GET(){
  return NextResponse.json({
    name:'CTCI Plugin API',
    apiVersion:PLUGIN_API_VERSION,
    packageFormat:'zip',
    maxPackageBytes:10*1024*1024,
    maxUncompressedBytes:50*1024*1024,
    maxArchiveEntries:500,
    maxSingleFileBytes:16*1024*1024,
    entryRule:'Bundled JavaScript file under dist/ ending in .js',
    manifest:{
      file:'plugin.json',
      required:['id','name','version','author','apiVersion','entry','permissions'],
      schema:{
        id:'lowercase slug: /^[a-z0-9][a-z0-9-]{1,62}$/',
        name:'string, max 100 chars',
        version:'semantic version, e.g. 1.0.0',
        author:'string, max 100 chars',
        description:'optional string, max 2000 chars',
        apiVersion:PLUGIN_API_VERSION,
        entry:'dist/index.js',
        permissions:'array of capabilities',
        commands:'optional array of {name, aliases?, description?, permissions?}',
        configSchema:'optional JSON object',
        ui:'optional declarative UI contributions; requires ui.render'
      }
    },
    capabilities:[...ALLOWED_PLUGIN_PERMISSIONS],
    ui:{
      model:'Declarative UI only. CTCI renders validated JSON; plugin HTML, React, CSS and JavaScript are never injected into dashboard/OBS DOM.',
      dashboard:{
        placements:['overview','plugins','commands','badges'],
        maxCards:20,
        maxBlocksPerCard:30,
        blockTypes:{
          heading:{fields:['type="heading"','text','level?: 2|3|4']},
          text:{fields:['type="text"','text']},
          stat:{fields:['type="stat"','label','value']},
          badge:{fields:['type="badge"','text']},
          image:{fields:['type="image"','src: HTTPS URL','alt?']},
          link:{fields:['type="link"','label','href: HTTPS URL or internal /path','variant?: primary|secondary']},
          progress:{fields:['type="progress"','label?','value:number','max?:number']},
          divider:{fields:['type="divider"']}
        },
        settings:{
          requires:['ui.render','config.read','config.write'],
          maxPerCard:30,
          types:['text','number','boolean','color','select'],
          fields:['key','label','description?','type','default?','min?','max?','step?','options?'],
          storage:'Values are validated server-side and stored per streamer in plugin_configurations.'
        }
      },
      overlay:{
        maxWidgets:40,
        widgetTypes:['text','image','box','progress'],
        coordinateSystem:'x/y/width/height are percentages of OBS browser source; x,y 0-100; width,height 1-100',
        commonFields:['id','type','x?','y?','width?','height?','opacity?','color?','background?','borderRadius?','zIndex?'],
        textFields:['text?','fontSize?'],
        imageFields:['src: HTTPS URL'],
        progressFields:['value','max?'],
        refresh:'Enabled plugin overlay contributions are reloaded by the overlay approximately every 15 seconds.'
      }
    },
    security:{
      prohibited:['eval','vm2','arbitrary require','direct filesystem access','process/env access','direct database access','direct OAuth token access','cross-streamer data access','raw HTML injection','raw React component injection','javascript: URLs','HTTP asset URLs'],
      archiveRules:['No absolute paths','No .. path traversal','No node_modules','No .env/.pem/.key files','Maximum 500 archive entries','10 MB compressed','50 MB total expanded','16 MB max expanded file','ZIP64 rejected'],
      marketplace:['Only the CTCI owner can publish','Published id+version+checksum releases are immutable','Private uploads cannot overwrite Marketplace plugin IDs or versions','Marketplace installs accept only the current approved version'],
      execution:'Declarative UI contributions execute today because CTCI renders them. Arbitrary uploaded plugin JavaScript remains non-executable until a CTCI isolated runtime supports declared capabilities.'
    },
    packageLayout:['plugin.json','dist/index.js'],
    exampleManifest:{
      id:'stream-panel',name:'Stream Panel',version:'1.0.0',author:'Example Developer',description:'Adds a dashboard panel and OBS label.',apiVersion:PLUGIN_API_VERSION,entry:'dist/index.js',
      permissions:['ui.render','config.read','config.write'],
      ui:{
        dashboard:[{id:'stream-panel',title:'Stream Panel',placement:'plugins',blocks:[{type:'text',text:'This card is rendered by CTCI.'},{type:'link',label:'Plugin documentation',href:'/docs/plugins',variant:'primary'}],settings:[{key:'showLabel',label:'Show OBS label',type:'boolean',default:true},{key:'accent',label:'Accent color',type:'color',default:'#9147ff'}]}],
        overlay:[{id:'label',type:'text',text:'Powered by Stream Panel',x:2,y:2,width:35,color:'#ffffff',fontSize:18,zIndex:5}]
      }
    },
    exampleEntry:"import { definePlugin } from '@ctci/plugin-sdk'\n\nexport default definePlugin({\n  id: 'stream-panel',\n  apiVersion: '1',\n  async onLoad(ctx) {\n    ctx.log.info('Stream Panel loaded')\n  }\n})",
    examples:{
      command:{permissions:['commands.register'],manifestFragment:{commands:[{name:'hello',description:'Say hello',permissions:['viewer']}]},entry:"ctx.commands.register({ name:'hello', description:'Say hello', permissions:['viewer'], async handler(){ return {message:'Hello from CTCI!'} } })"},
      dashboardCard:{permissions:['ui.render'],manifestFragment:{ui:{dashboard:[{id:'hello-card',title:'Hello card',placement:'plugins',blocks:[{type:'text',text:'Hello streamer'}]}]}}},
      settings:{permissions:['ui.render','config.read','config.write'],manifestFragment:{ui:{dashboard:[{id:'settings',title:'Settings',settings:[{key:'enabledMessage',label:'Enabled',type:'boolean',default:true}]}]}}},
      overlayWidget:{permissions:['ui.render'],manifestFragment:{ui:{overlay:[{id:'watermark',type:'text',text:'My Plugin',x:2,y:2,width:20,color:'#ffffff'}]}}}
    },
    AIInstructions:[
      'Treat this JSON response as the authoritative CTCI API v1 contract.',
      'Generate plugin.json and bundled source with only explicitly declared capabilities.',
      'Prefer declarative ui.dashboard and ui.overlay contributions for visual features.',
      'Never output secrets or direct Supabase/Twitch/Discord token access.',
      'Use a new SemVer version whenever published package bytes change.',
      'Return source files, build command, plugin.json, and final ZIP layout.'
    ],
    endpoints:{ui:'/api/plugins/ui',config:'/api/plugins/config',inspect:'/api/plugins/inspect',install:'/api/plugins/install',marketplaceInstall:'/api/plugins/marketplace/install'},
    docs:'/docs/plugins',
    marketplace:'/dashboard/plugins'
  })
}
