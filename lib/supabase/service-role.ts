import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// IMPORTANT: This module must only ever be imported from server-side code
// (API routes or Server Components). It contains the service role key which
// bypasses Row Level Security and must NEVER be exposed to the browser.
//
// The client is created lazily (on first use) so that importing this module
// never throws during builds — only at runtime if the env var is missing.

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}