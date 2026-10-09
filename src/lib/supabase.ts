import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY. Add both to .env.local and restart.'
  );
}

async function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const signal = init?.signal ?? request?.signal;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });

  const requestUrl = request?.url ?? String(input);
  // Uploads need more time on weak mobile connections than small database/auth requests.
  const timeoutMs = requestUrl.includes('/storage/v1/object/') ? 120_000 : 30_000;
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export const supabase = createClient(url, key, {
  global: { fetch: fetchWithDeadline },
  auth: {
    // The static web build runs once outside a browser, where AsyncStorage has nothing to write to.
    storage: typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Needed by the Google sign-in flow.
    flowType: 'pkce',
  },
});
