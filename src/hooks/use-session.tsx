import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  /** True until the saved session has been read from the phone. */
  isLoading: boolean;
};

/** Where the phone keeps the id of the user it last knew to be an admin. */
const ADMIN_KEY = 'pawpin.admin';

const SessionContext = createContext<SessionState & { adminId: string | null }>({
  session: null,
  isLoading: true,
  adminId: null,
});

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

  // The id of the user known to be an admin, if any. Kept as an id, so it stops holding the moment
  // someone else signs in. It only decides which screens are shown: the database is what refuses
  // the admin's reads and actions to everyone else. `undefined` until the phone's copy is read.
  const [adminId, setAdminId] = useState<string | null | undefined>(undefined);

  // The phone's copy first, so an admin opens straight into their own tabs instead of seeing the
  // Map until the database answers.
  useEffect(() => {
    AsyncStorage.getItem(ADMIN_KEY)
      .catch(() => null)
      // Not over an answer from the database, should that have come first.
      .then((saved) => setAdminId((known) => (known === undefined ? saved : known)));
  }, []);

  // Then the database, once per sign-in. It corrects the phone's copy both ways.
  const userId = state.session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let isGone = false;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        // A failed read leaves things as the phone last knew them.
        if (isGone || !data) return;
        const isAdmin = data.role === 'admin';
        setAdminId(isAdmin ? userId : null);
        (isAdmin
          ? AsyncStorage.setItem(ADMIN_KEY, userId)
          : AsyncStorage.removeItem(ADMIN_KEY)
        ).catch(() => {});
      });
    return () => {
      isGone = true;
    };
  }, [userId]);

  return (
    <SessionContext
      value={{
        session: state.session,
        isLoading: state.isLoading || adminId === undefined,
        adminId: adminId ?? null,
      }}>
      {children}
    </SessionContext>
  );
}

export function useSession() {
  const { session, isLoading, adminId } = use(SessionContext);
  const user = session?.user;
  // After a guest links Google, the name and photo may only be on the linked identity. The Google
  // name comes first: a guest's own name is a made-up "Guest1234", which Google's replaces.
  const google = user?.identities?.find((identity) => identity.provider === 'google')?.identity_data;
  const name: string | undefined = google?.full_name ?? user?.user_metadata?.full_name;
  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url ?? google?.avatar_url;
  return {
    session,
    isLoading,
    isGuest: user?.is_anonymous === true,
    isAdmin: !!user && adminId === user.id,
    name,
    avatarUrl,
  };
}
