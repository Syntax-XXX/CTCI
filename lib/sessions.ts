import { isFeatureEnabled } from '@/lib/features'

export async function touchStreamSession(admin:any,ownerId:string,input:{source:'twitch'|'youtube';streamId?:string|null;title?:string|null}){
  if(!await isFeatureEnabled(admin,ownerId,'stream_sessions'))return null
  const open=await admin.from('stream_sessions').select('*').eq('owner_id',ownerId).is('ended_at',null).order('started_at',{ascending:false}).limit(1).maybeSingle()
  if(open.error)throw open.error
  const now=new Date().toISOString()
  if(open.data){
    const last=Date.parse(open.data.metadata?.last_activity||open.data.started_at||now)
    if(Date.now()-last>2*60*60*1000){await admin.from('stream_sessions').update({ended_at:new Date(last+30*60*1000).toISOString()}).eq('id',open.data.id)}
    else{
      const patch:any={metadata:{...(open.data.metadata||{}),last_activity:now,last_source:input.source}}
      if(input.title)patch.title=input.title
      if(input.source==='twitch'&&input.streamId)patch.twitch_stream_id=input.streamId
      if(input.source==='youtube'&&input.streamId)patch.youtube_broadcast_id=input.streamId
      const r=await admin.from('stream_sessions').update(patch).eq('id',open.data.id).select('*').single();if(r.error)throw r.error;return r.data
    }
  }
  const payload:any={owner_id:ownerId,started_at:now,title:input.title||null,metadata:{last_activity:now,last_source:input.source}}
  if(input.source==='twitch')payload.twitch_stream_id=input.streamId||null
  if(input.source==='youtube')payload.youtube_broadcast_id=input.streamId||null
  const created=await admin.from('stream_sessions').insert(payload).select('*').single();if(created.error)throw created.error;return created.data
}
