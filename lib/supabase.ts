import { createClient } from '@supabase/supabase-js'

/**
 * Service-role admin client — server-side only, never shipped to the browser.
 * Used for cache reads/writes and storing analyses.
 */
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
