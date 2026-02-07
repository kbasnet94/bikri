import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug logging
console.log('[Supabase Init] URL:', supabaseUrl);
console.log('[Supabase Init] Key exists:', !!supabaseAnonKey);
console.log('[Supabase Init] All env vars:', import.meta.env);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase Init] Missing environment variables!');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'exists' : 'MISSING');
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
});

console.log('[Supabase Init] Client created successfully');
