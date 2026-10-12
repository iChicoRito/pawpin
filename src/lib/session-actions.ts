import { pauseAlertRegistration, registerForAlerts, unregisterForAlerts } from '@/lib/alerts';
import { supabase } from '@/lib/supabase';

let changingSession = false;

async function changeSession<T>(action: () => Promise<T>): Promise<T> {
  if (changingSession) throw new Error('An account change is already in progress.');
  changingSession = true;
  pauseAlertRegistration(true);
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id;
    if (userId) {
      await unregisterForAlerts(userId);
      const current = await supabase.auth.getSession();
      if (current.error) throw current.error;
      if (current.data.session?.user.id !== userId) throw new Error('The current account changed.');
    }
    return await action();
  } finally {
    pauseAlertRegistration(false);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session) await registerForAlerts(data.session.user.id);
    } catch (error) {
      console.warn('Restoring the alert pass failed:', error);
    } finally {
      changingSession = false;
    }
  }
}

export async function signOutWithAlerts() {
  try {
    return await changeSession(() => supabase.auth.signOut());
  } catch (error) {
    return { error };
  }
}

export function switchAccountWithAlerts(action: () => Promise<boolean>) {
  return changeSession(action);
}
