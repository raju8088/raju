import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseUrl.startsWith('http') && (supabaseAnonKey || supabaseServiceKey)
);

/**
 * Public client for client-side or anon operations
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null;
  }
  return createClient(supabaseUrl!, supabaseAnonKey || supabaseServiceKey!);
}

/**
 * Service role client for privileged backend operations (never exposed to client)
 */
export function getSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
