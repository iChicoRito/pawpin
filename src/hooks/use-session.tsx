import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  /** True until the saved session has been read from the phone. */
  isLoading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, isLoading: true });

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    // Fires once with the saved session (or null), then again on every sign-in and sign-out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, isLoading: false });
    });
    const refreshFor = (next: AppStateStatus) => {
      if (next === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    const appState = Platform.OS !== 'web'
      ? AppState.addEventListener('change', refreshFor)
      : null;
    if (appState) refreshFor(AppState.currentState);
    return () => {
      data.subscription.unsubscribe();
      appState?.remove();
      if (appState) supabase.auth.stopAutoRefresh();
    };
  }, []);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession() {
  const { session, isLoading } = use(SessionContext);
  const user = session?.user;
  // After a guest links Google, the name and photo may only be on the linked identity. The Google
  // name comes first: a guest's own name is a made-up "Guest1234", which Google's replaces.
  const google = user?.identities?.find((identity) => identity.provider === 'google')?.identity_data;
  const name: string | undefined = google?.full_name ?? user?.user_metadata?.full_name;
  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url ?? google?.avatar_url;
  return { session, isLoading, isGuest: user?.is_anonymous === true, name, avatarUrl };
}
