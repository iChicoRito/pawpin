import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

// On web the sign-in opens in a popup; this hands the result back to the page that opened it. No-op on phones.
WebBrowser.maybeCompleteAuthSession();

/** Where Google sends the user back to: `pawpin://` on a phone. Must be on Supabase's redirect allow list. */
const redirectTo = Linking.createURL('/');

export type AuthFlowError = Error & { code?: string };

/** Reads `?a=1&b=2` and `#a=1&b=2` alike. Supabase uses either, depending on the outcome. */
function readParams(url: string) {
  const params: Record<string, string> = {};
  for (const pair of url.split(/[?#]/).slice(1).join('&').split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params;
}

/** How long to wait for the return link after the browser reports closed. */
const RETURN_LINK_GRACE_MS = 2000;

/** Returns true when the user finished signing in, false when they closed the browser. */
async function finishInBrowser(url: string) {
  // On Android the app can come back to the front before the return link is delivered. The browser
  // call then reports "closed" although sign-in succeeded, so the link is also listened for directly.
  let onReturnLink: (returnUrl: string) => void = () => {};
  const returnLink = new Promise<string>((resolve) => (onReturnLink = resolve));
  const subscription = Linking.addEventListener('url', (event) => {
    if (/[?#&](code|error)=/.test(event.url)) onReturnLink(event.url);
  });

  let returnUrl: string | null;
  try {
    const browser = WebBrowser.openAuthSessionAsync(url, redirectTo).then((result) =>
      result.type === 'success' ? result.url : null
    );
    returnUrl =
      (await Promise.race([browser, returnLink])) ??
      (await Promise.race([
        returnLink,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), RETURN_LINK_GRACE_MS)),
      ]));
  } finally {
    subscription.remove();
  }
  if (!returnUrl) return false;

  const params = readParams(returnUrl);
  if (params.error || !params.code) {
    const error: AuthFlowError = new Error(
      params.error_description || 'Google sign-in did not finish.'
    );
    error.code = params.error_code;
    throw error;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(params.code);
  if (error) throw error;
  return true;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  return finishInBrowser(data.url);
}

/** Turns the current guest into a Google user. The user id stays the same, so their reports stay theirs. */
export async function linkGoogle() {
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  return finishInBrowser(data.url);
}
