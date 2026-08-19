import {NextResponse} from'next/server'
import{createServerSupabase}from'@/lib/supabase/server'
import{createAdminSupabase}from'@/lib/supabase/admin'

export const runtime='nodejs'

export async function POST(){
  const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const token=process.env.DISCORD_BOT_TOKEN;if(!token)return NextResponse.json({error:'DISCORD_BOT_TOKEN is not configured'},{status:503})
  const admin=createAdminSupabase()
  const[{data:rules,error:ruleError},{data:links,error:linkError}]=await Promise.all([
    admin.from('discord_badge_sync').select('badge_id,guild_id,role_id').eq('owner_id',user.id).eq('enabled',true),
    admin.from('discord_user_links').select('twitch_login,twitch_user_id,discord_user_id').eq('owner_id',user.id),
  ])
  if(ruleError||linkError)return NextResponse.json({error:(ruleError||linkError)?.message},{status:500})
  let granted=0,removed=0,checked=0
  for(const rule of rules||[])for(const link of links||[]){
    checked++
    const res=await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(rule.guild_id)}/members/${encodeURIComponent(link.discord_user_id)}`,{headers:{Authorization:`Bot ${token}`},cache:'no-store'})
    const hasRole=res.ok&&((await res.json()) as {roles?:string[]}).roles?.includes(rule.role_id)
    const existing=await admin.from('badge_assignments').select('id').eq('badge_id',rule.badge_id).eq('owner_id',user.id).eq('twitch_login',link.twitch_login).maybeSingle()
    if(hasRole&&!existing.data){const r=await admin.from('badge_assignments').insert({badge_id:rule.badge_id,owner_id:user.id,twitch_login:link.twitch_login,twitch_user_id:link.twitch_user_id||null,source:'discord'});if(!r.error)granted++}
    if(!hasRole&&existing.data){const r=await admin.from('badge_assignments').delete().eq('id',existing.data.id).eq('source','discord');if(!r.error)removed++}
  }
  return NextResponse.json({ok:true,checked,granted,removed})
}
