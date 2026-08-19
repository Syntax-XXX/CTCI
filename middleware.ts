import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkprxdjrpnfbfxzryhtq.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_c4JpbBoCgtcJ8q3rqiuc7Q_heLb1GRw'

type CookieWrite = { name: string; value: string; options?: any }

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: CookieWrite[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/auth/:path*', '/api/twitch/:path*'],
}
