import { createBrowserClient } from '@supabase/ssr'
import { createPublicClient } from '@/lib/supabase/public-client'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkprxdjrpnfbfxzryhtq.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_c4JpbBoCgtcJ8q3rqiuc7Q_heLb1GRw'

export function createClient() {
  // OBS/browser-source overlays are public read-only surfaces and do not need
  // the streamer's Supabase Auth session. Avoid the SSR auth client there,
  // because Chromium/CEF environments can fail navigator.locks acquisition
  // for the shared sb-*-auth-token and prevent the overlay from initializing.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/overlay/')) {
    return createPublicClient()
  }

  return createBrowserClient(url, key)
}
