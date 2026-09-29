import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from '@/lib/demo/client';
import { installDemoFetch } from '@/lib/demo/http';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
  );
}

export const isDemoMode = () =>
  typeof window !== 'undefined' &&
  document.cookie.split(';').some((c) => c.trim() === 'cwms_demo=1');

let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  if (isDemoMode()) {
    installDemoFetch();
    cached = createDemoClient() as unknown as SupabaseClient;
  } else {
    cached = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return cached;
}

export const supabase = getClient();