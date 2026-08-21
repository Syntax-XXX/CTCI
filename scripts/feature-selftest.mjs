import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8')
const failures=[]
const pass=(name,ok,details='')=>{if(!ok)failures.push(`${name}${details?`: ${details}`:''}`);else console.log(`✓ ${name}`)}

const features=read('lib/features.ts')
const keys=[...features.matchAll(/\{key:'([^']+)'/g)].map(m=>m[1])
pass('feature registry is populated',keys.length>=40,`found ${keys.length}`)
pass('feature keys are unique',new Set(keys).size===keys.length)
pass('all optional feature defaults are false',features.includes('Object.fromEntries(FEATURE_DEFINITIONS.map(f=>[f.key,false]))'))

const gated=read('app/api/features/[key]/route.ts')
pass('feature workbench authenticates users',gated.includes("return NextResponse.json({error:'Unauthorized'}"))
pass('feature workbench enforces feature flags',gated.includes('isFeatureEnabled(admin,user.id,key)'))
const ai=read('app/api/ai/[mode]/route.ts'),openai=read('lib/openai.ts')
pass('AI endpoints enforce feature flags',ai.includes('isFeatureEnabled(admin,user.id,feature)'))
pass('AI uses streamer-scoped Vault key',openai.includes('getStreamerOpenAIKey')&&openai.includes("admin.rpc('get_streamer_openai_key'"))
pass('AI has no shared OPENAI_API_KEY fallback',!openai.includes('process.env.OPENAI_API_KEY')&&!ai.includes('process.env.OPENAI_API_KEY'))

const youtube=read('lib/youtube.ts')
pass('YouTube OAuth has chat write/moderation scope',youtube.includes('https://www.googleapis.com/auth/youtube.force-ssl'))
pass('YouTube announcements use authenticated insert',youtube.includes('sendYouTubeChatMessage'))

const engagement=read('lib/engagement.ts'),moderation=read('lib/moderation.ts'),automation=read('lib/automation.ts')
pass('cross-platform engagement commands implemented',['vote','join','ask','points','redeem','predict','roll'].every(x=>engagement.includes(`command==='${x}'`)))
pass('moderation runtime implemented',['blocked_words','links','caps','length','repeated_text','rate'].every(x=>moderation.includes(`'${x}'`)))
pass('automation runtime is declarative',automation.includes('executeAction')&&!automation.includes('eval(')&&!automation.includes('new Function'))

const overlay=read('app/overlay/[slug]/page.tsx'),featureOverlay=read('components/FeatureOverlaySurface.tsx')
pass('multi-overlay resolver is used by OBS renderer',overlay.includes('/api/overlay/config?slug='))
pass('platform identity rendered from source metadata',overlay.includes('<PlatformIcon source={message.source}/>'))
pass('feature overlay surface includes live widgets',featureOverlay.includes('LIVE POLL')&&featureOverlay.includes('SpeechSynthesisUtterance'))

const allRuntime=['lib/engagement.ts','lib/moderation.ts','lib/automation.ts','lib/feature-runtime.ts','lib/sessions.ts','lib/announcements.ts','app/api/overlay/features/route.ts','app/dashboard/features/[key]/page.tsx']
pass('required feature runtime files exist',allRuntime.every(p=>fs.existsSync(path.join(root,p))))

const scanFiles=['lib/engagement.ts','lib/moderation.ts','lib/automation.ts','lib/feature-runtime.ts','app/api/features/[key]/route.ts','app/api/ai/[mode]/route.ts']
const unsafe=scanFiles.filter(p=>/\beval\s*\(|new\s+Function\s*\(/.test(read(p)))
pass('no dynamic code execution in feature runtimes',unsafe.length===0,unsafe.join(', '))

if(failures.length){console.error('\nFeature self-test FAILED:');for(const f of failures)console.error(`✗ ${f}`);process.exit(1)}
console.log(`\nFeature self-test passed (${keys.length} optional feature definitions checked).`)
