import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { inspectPluginZip } from '@/lib/plugins'

export const runtime='nodejs'

export async function POST(request:NextRequest){
  const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const form=await request.formData();const file=form.get('file')
  if(!(file instanceof File))return NextResponse.json({error:'Plugin ZIP is required'},{status:400})
  if(file.size>10*1024*1024)return NextResponse.json({error:'Plugin package exceeds 10 MB'},{status:413})
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());const result=inspectPluginZip(bytes)
    return NextResponse.json({ok:true,manifest:result.manifest,fileCount:result.fileCount,uncompressedBytes:result.uncompressedBytes})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid plugin package'},{status:400})}
}
