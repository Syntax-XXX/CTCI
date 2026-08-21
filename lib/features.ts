import type { SupabaseClient } from '@supabase/supabase-js'

export type FeatureRequirement = 'none'|'twitch'|'youtube'|'discord'|'obs'|'spotify'|'streamelements'|'streamlabs'|'ai'|'email'|'translation'
export type FeatureDefinition = {
  key:string
  name:string
  group:string
  description:string
  requirements:FeatureRequirement[]
  maturity:'ready'|'foundation'|'integration'
}

export const FEATURE_DEFINITIONS:FeatureDefinition[] = [
  {key:'chat_studio',name:'Live Chat Studio',group:'Chat',description:'Merged Twitch + YouTube moderation and live message control.',requirements:['none'],maturity:'ready'},
  {key:'unified_moderation',name:'Unified Moderation',group:'Chat',description:'Cross-platform filters, spam rules, blocked links and moderation actions.',requirements:['twitch','youtube'],maturity:'foundation'},
  {key:'paid_events',name:'Paid & Special Events',group:'Chat',description:'Super Chats, memberships, bits, subs, gifts and raids as standardized events.',requirements:['twitch','youtube'],maturity:'foundation'},
  {key:'featured_messages',name:'Featured Messages',group:'Chat',description:'Pin or queue chat messages for large OBS display.',requirements:['none'],maturity:'foundation'},
  {key:'qna',name:'Q&A Mode',group:'Chat',description:'Collect, moderate and display viewer questions.',requirements:['none'],maturity:'foundation'},
  {key:'streamer_inbox',name:'Streamer Inbox',group:'Chat',description:'Priority feed for mentions, questions, paid events and mod alerts.',requirements:['none'],maturity:'foundation'},
  {key:'chat_announcements',name:'Cross-platform Announcements',group:'Chat',description:'Send one announcement to enabled chat platforms.',requirements:['twitch','youtube'],maturity:'integration'},
  {key:'custom_commands',name:'Visual Command Builder',group:'Commands',description:'Create commands without writing plugins.',requirements:['none'],maturity:'foundation'},
  {key:'command_variables',name:'Command Variables',group:'Commands',description:'Use user, platform, uptime, viewer count and other dynamic variables.',requirements:['none'],maturity:'foundation'},
  {key:'chat_games',name:'Chat Games',group:'Engagement',description:'Trivia, roulette, word scramble, races and other cross-platform games.',requirements:['none'],maturity:'foundation'},
  {key:'loyalty',name:'Loyalty & XP',group:'Engagement',description:'Cross-platform XP, levels and viewer progression.',requirements:['none'],maturity:'foundation'},
  {key:'viewer_cosmetics',name:'Viewer Cosmetics',group:'Engagement',description:'Unlockable fonts, colors, nameplates, glows and badges.',requirements:['none'],maturity:'foundation'},
  {key:'currency',name:'Streamer Currency',group:'Engagement',description:'Configurable viewer points with anti-farming controls.',requirements:['none'],maturity:'foundation'},
  {key:'reward_store',name:'Reward Store',group:'Engagement',description:'Spend points on chat styles, sounds, badges and actions.',requirements:['none'],maturity:'foundation'},
  {key:'cross_platform_polls',name:'Cross-platform Polls',group:'Engagement',description:'Combine Twitch and YouTube votes into one poll.',requirements:['none'],maturity:'ready'},
  {key:'predictions',name:'Predictions',group:'Engagement',description:'CTCI-native predictions across platforms.',requirements:['none'],maturity:'foundation'},
  {key:'giveaways',name:'Cross-platform Giveaways',group:'Engagement',description:'One entrant pool across Twitch and YouTube.',requirements:['none'],maturity:'ready'},
  {key:'stream_tools',name:'Stream Tools',group:'Stream',description:'Presets, polls and giveaways dashboard.',requirements:['none'],maturity:'ready'},
  {key:'automation_builder',name:'Visual Automation Builder',group:'Automation',description:'Trigger → conditions → actions workflows across chat, overlays and integrations.',requirements:['none'],maturity:'foundation'},
  {key:'obs_websocket',name:'OBS WebSocket Integration',group:'Automation',description:'Scene switching, source visibility, audio and local OBS actions.',requirements:['obs'],maturity:'integration'},
  {key:'scene_profiles',name:'Scene Profiles',group:'Automation',description:'Map overlay presets to stream scenes.',requirements:['obs'],maturity:'foundation'},
  {key:'multi_overlays',name:'Multiple Overlays',group:'Overlay',description:'Separate overlay URLs for main, vertical, minimal and event layouts.',requirements:['none'],maturity:'foundation'},
  {key:'overlay_editor',name:'Drag & Drop Overlay Editor',group:'Overlay',description:'Visual canvas for chat, alerts, goals and widgets.',requirements:['none'],maturity:'foundation'},
  {key:'overlay_layers',name:'Overlay Layers',group:'Overlay',description:'Independent ordered layers for chat, alerts, polls, goals and widgets.',requirements:['none'],maturity:'foundation'},
  {key:'responsive_breakpoints',name:'Responsive Breakpoints',group:'Overlay',description:'Landscape, portrait and compact layout variants.',requirements:['none'],maturity:'foundation'},
  {key:'template_marketplace',name:'Theme & Template Marketplace',group:'Overlay',description:'Publish and install shareable overlay templates.',requirements:['none'],maturity:'foundation'},
  {key:'viewer_identity',name:'Unified Viewer Profiles',group:'Identity',description:'Verified Twitch, YouTube and Discord identities under one CTCI viewer.',requirements:['twitch','youtube','discord'],maturity:'foundation'},
  {key:'moderator_accounts',name:'Moderator & Team Accounts',group:'Identity',description:'Owner, admin, moderator, designer, developer, analyst and read-only roles.',requirements:['none'],maturity:'foundation'},
  {key:'audit_log',name:'Team Audit Log',group:'Identity',description:'Track configuration and moderation changes by team members.',requirements:['none'],maturity:'foundation'},
  {key:'stream_sessions',name:'Stream Sessions',group:'Analytics',description:'Automatically group activity and analytics per broadcast.',requirements:['twitch','youtube'],maturity:'foundation'},
  {key:'chat_analytics',name:'Chat Analytics',group:'Analytics',description:'Messages/minute, unique chatters, top commands, platforms and activity spikes.',requirements:['none'],maturity:'foundation'},
  {key:'chat_heatmap',name:'Chat Heatmap',group:'Analytics',description:'Timeline visualization of chat activity spikes.',requirements:['none'],maturity:'foundation'},
  {key:'clip_suggestions',name:'Clip Suggestions',group:'Analytics',description:'Mark high-activity moments as potential clips.',requirements:['twitch','youtube'],maturity:'foundation'},
  {key:'ai_stream_recap',name:'AI Stream Recap',group:'AI',description:'Summarize chat topics, moments, FAQs and moderation events after a stream.',requirements:['ai'],maturity:'integration'},
  {key:'ai_moderation',name:'AI Moderation Assistant',group:'AI',description:'Flag borderline messages with reasons and suggested actions.',requirements:['ai'],maturity:'integration'},
  {key:'ai_builder',name:'AI Command & Plugin Creator',group:'AI',description:'Generate safe CTCI command/plugin configurations from natural language.',requirements:['ai'],maturity:'integration'},
  {key:'tts',name:'TTS Queue',group:'Integrations',description:'Speak approved chat messages with role/cooldown controls.',requirements:['none'],maturity:'integration'},
  {key:'translation',name:'Chat Translation',group:'Integrations',description:'Optional translated text under chat messages.',requirements:['translation'],maturity:'integration'},
  {key:'spotify',name:'Spotify Now Playing',group:'Integrations',description:'Current track widgets and automation triggers.',requirements:['spotify'],maturity:'integration'},
  {key:'seventv',name:'7TV Emotes',group:'Integrations',description:'Render 7TV emotes in the unified overlay.',requirements:['none'],maturity:'integration'},
  {key:'bttv',name:'BTTV Emotes',group:'Integrations',description:'Render BetterTTV emotes in the unified overlay.',requirements:['none'],maturity:'integration'},
  {key:'ffz',name:'FrankerFaceZ Emotes',group:'Integrations',description:'Render FFZ emotes in the unified overlay.',requirements:['none'],maturity:'integration'},
  {key:'streamelements',name:'StreamElements Integration',group:'Integrations',description:'Use StreamElements data and events.',requirements:['streamelements'],maturity:'integration'},
  {key:'streamlabs',name:'Streamlabs Integration',group:'Integrations',description:'Use Streamlabs alerts and data.',requirements:['streamlabs'],maturity:'integration'},
  {key:'plugin_dependencies',name:'Plugin Dependencies',group:'Plugins',description:'Required/optional plugin and API-version dependency declarations.',requirements:['none'],maturity:'foundation'},
  {key:'plugin_updates',name:'Plugin Updates & Rollback',group:'Plugins',description:'Version history, update channels and one-click rollback.',requirements:['none'],maturity:'foundation'},
  {key:'plugin_health',name:'Plugin Health Dashboard',group:'Plugins',description:'Execution, errors, permissions, storage and activity health.',requirements:['none'],maturity:'foundation'},
  {key:'plugin_logs',name:'Plugin Sandbox Logs',group:'Plugins',description:'Structured plugin developer logs and test output.',requirements:['none'],maturity:'foundation'},
  {key:'public_streamer_page',name:'Public Streamer Page',group:'Publishing',description:'Optional branded public page with live status, socials and widgets.',requirements:['none'],maturity:'foundation'},
  {key:'setup_export',name:'Import / Export Setup',group:'Safety',description:'Portable JSON bundle for overlays, commands, presets and plugin config.',requirements:['none'],maturity:'foundation'},
  {key:'backup_snapshots',name:'Configuration Snapshots',group:'Safety',description:'Versioned restore points before major configuration changes.',requirements:['none'],maturity:'foundation'},
  {key:'setup_wizard',name:'First-run Setup Wizard',group:'Safety',description:'Guided Twitch, YouTube, Discord and OBS onboarding.',requirements:['none'],maturity:'foundation'},
  {key:'obs_tester',name:'OBS Source Tester',group:'Safety',description:'Preview fake messages, emotes, paid events and resolutions.',requirements:['none'],maturity:'foundation'},
  {key:'health_page',name:'Integration Health Page',group:'Safety',description:'Connection health for Twitch, YouTube, Discord, Realtime and OBS.',requirements:['none'],maturity:'foundation'},
  {key:'reconnect_warnings',name:'Reconnect Warnings',group:'Safety',description:'Warn when scopes, tokens or guild/channel integrations need attention.',requirements:['none'],maturity:'foundation'},
  {key:'status_notifications',name:'Status Notifications',group:'Safety',description:'Notify when an important integration breaks.',requirements:['email'],maturity:'integration'},
]

export const FEATURE_KEYS = new Set(FEATURE_DEFINITIONS.map(feature=>feature.key))
export type FeatureKey = string

export async function featureFlags(admin:SupabaseClient,ownerId:string):Promise<Record<string,boolean>>{
  const{data,error}=await admin.from('streamer_feature_flags').select('flags').eq('owner_id',ownerId).maybeSingle()
  if(error)throw error
  const raw=data?.flags&&typeof data.flags==='object'?data.flags as Record<string,unknown>:{}
  return Object.fromEntries(FEATURE_DEFINITIONS.map(feature=>[feature.key,raw[feature.key]===true]))
}

export async function isFeatureEnabled(admin:SupabaseClient,ownerId:string,key:string){
  if(!FEATURE_KEYS.has(key))return false
  const flags=await featureFlags(admin,ownerId)
  return flags[key]===true
}
