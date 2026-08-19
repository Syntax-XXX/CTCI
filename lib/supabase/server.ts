import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkprxdjrpnfbfxzryhtq.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_c4JpbBoCgtcJ8q3rqiuc7Q_heLb1GRw'

export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot always write cookies; proxy.ts refreshes them.
        }
      },
    },
  })
}
