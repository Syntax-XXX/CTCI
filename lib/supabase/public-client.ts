import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkprxdjrpnfbfxzryhtq.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_c4JpbBoCgtcJ8q3rqiuc7Q_heLb1GRw'

let publicClient: SupabaseClient | null = null

/**
 * Public, sessionless Supabase client for OBS/browser-source surfaces.
 *
 * OBS does not need a user session. Using the normal @supabase/ssr browser
 * client here makes GoTrue coordinate auth state with navigator.locks, which
 * is unreliable in some Chromium/CEF browser-source environments. Because
 * this client never persists or refreshes an auth session, a no-op lock is
 * safe and keeps public Realtime/PostgREST available in OBS.
 */
export function createPublicClient(): SupabaseClient {
  if (publicClient) return publicClient

  publicClient = createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
    },
  })

  return publicClient
}
