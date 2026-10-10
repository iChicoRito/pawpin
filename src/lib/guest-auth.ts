import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export class GuestSignInError extends Error {
  constructor(message: string, public readonly retryAt: string | null = null) {
    super(message);
    this.name = 'GuestSignInError';
  }
}

async function checkCooldown(deviceId: string) {
  const { data, error } = await supabase.rpc('guest_creation_status', { device_id: deviceId });
  if (error) throw error;
  if (!data || !Object.hasOwn(data, 'retry_at') ||
    (data.retry_at !== null && (typeof data.retry_at !== 'string' || !Number.isFinite(Date.parse(data.retry_at))))) {
    throw new Error('Invalid guest creation status.');
  }
  if (data.retry_at !== null) {
    throw new GuestSignInError(
      `This phone already created a guest account. Try again after ${new Date(data.retry_at).toLocaleString()}, or continue with Google.`,
      data.retry_at,
    );
  }
}

async function createGuest() {
  if (Platform.OS !== 'android') {
    throw new GuestSignInError('Guest accounts are available in the Android app. Continue with Google instead.');
  }
  const deviceId = Application.getAndroidId().toLowerCase();
  if (!/^[0-9a-f]{1,16}$/.test(deviceId) || /^0+$/.test(deviceId)) {
    throw new GuestSignInError('Could not verify this phone for a guest account. Continue with Google instead.');
  }
  await checkCooldown(deviceId);
  const name = `Guest${1000 + Math.floor(Math.random() * 9000)}`;
  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { full_name: name, guest_device_id: deviceId } },
  });
  if (error) {
    // Auth hides trigger errors. Read server status again when another request may have won.
    try {
      await checkCooldown(deviceId);
    } catch (statusError) {
      if (statusError instanceof GuestSignInError) throw statusError;
    }
    throw error;
  }
}

let pending: Promise<void> | null = null;

/** Shared in-flight work prevents rapid taps from sending multiple creation requests. */
export function signInAsGuest() {
  return pending ??= createGuest().finally(() => { pending = null; });
}
