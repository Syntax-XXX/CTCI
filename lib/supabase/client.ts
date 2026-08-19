import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkprxdjrpnfbfxzryhtq.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_c4JpbBoCgtcJ8q3rqiuc7Q_heLb1GRw'

export function createClient() {
  return createBrowserClient(url, key)
}
