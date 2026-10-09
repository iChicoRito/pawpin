import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { ReportPlace } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

// Phones only. Browsers get alerts.web.ts.

/** Android sorts alerts into channels. PawPin has the one. */
const CHANNEL = 'default';
const CARD_KEY = 'pawpin.alerts-card-dismissed';

// An alert that arrives while the app is open is still shown. Without this the phone drops it.
// Android does not show the drop-down for an alert that makes no sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android 13 and up shows its "allow notifications" prompt only once a channel exists.
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Strays near you',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/**
 * Saves this phone's alert pass to the user's profile, if notifications are allowed. Called when
 * the app opens and each time it comes back to the front, so a pass that changed is saved again.
 * A failure is only logged: alerts are an extra, and must not stop the app from starting.
 */
export async function registerForAlerts(userId: string) {
  try {
    await ensureChannel();
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    // Reads the project id from app.json (`extra.eas.projectId`) and throws when there is none.
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);
    if (error) throw error;
  } catch (error) {
    console.warn('Saving the alert pass failed:', error);
  }
}

/**
 * Saves where the user was at their last fresh location read. New reports alert the people whose
 * last place is near. Only logged on failure, so it can never fail the nearby search it rides on.
 */
export async function saveLastPlace(userId: string, place: ReportPlace) {
  try {
    const { error } = await supabase
      .from('profiles')
      // PostGIS points are longitude first, then latitude.
      .update({ last_location: `SRID=4326;POINT(${place.longitude} ${place.latitude})` })
      .eq('id', userId);
    if (error) throw error;
  } catch (error) {
    console.warn('Saving the last place failed:', error);
  }
}

/** How far away a new report may be and still alert this user, in meters. Throws on failure. */
export async function fetchAlertRadius(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_radius_m')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data.notification_radius_m as number;
}

/** Throws on failure, so the screen can say the choice was not kept. */
export async function saveAlertRadius(userId: string, radiusM: number) {
  const { error } = await supabase
    .from('profiles')
    .update({ notification_radius_m: radiusM })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * The phone's answer on notifications, and the way to ask. `null` while it is being read. The
 * answer is read again when the app comes back to the front, since it can change in the phone's
 * settings.
 */
export function useAlertPermission() {
  const [permission, setPermission] = useState<Notifications.NotificationPermissionsStatus | null>(
    null,
  );

  useEffect(() => {
    const read = () => {
      Notifications.getPermissionsAsync()
        .then(setPermission)
        .catch((error) => console.warn('Reading the notifications permission failed:', error));
    };
    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => subscription.remove();
  }, []);

  async function request() {
    await ensureChannel();
    const next = await Notifications.requestPermissionsAsync();
    setPermission(next);
    return next;
  }

  return [permission, request] as const;
}

/** Keeps the signed-in user's alert pass saved while the app is open. */
export function useAlertRegistration(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    registerForAlerts(userId);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') registerForAlerts(userId);
    });
    return () => subscription.remove();
  }, [userId]);
}

/** The report an alert is about, or `null` when it names none. */
export function reportIdOf(response: Notifications.NotificationResponse | null | undefined) {
  const id = response?.notification.request.content.data?.reportId;
  return typeof id === 'string' ? id : null;
}

/**
 * Opens the report of an alert that was tapped: the tap that opened the app, and taps while it
 * runs. Used once, inside the signed-in part of the app, so a signed-out phone opens nothing.
 */
export function useAlertTaps() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  // The alert already opened. The same tap is handed over again on every render.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    const id = reportIdOf(response);
    const alert = response?.notification.request.identifier;
    if (!id || !alert || opened.current === alert) return;
    opened.current = alert;
    router.push({ pathname: '/report/[id]', params: { id } });
  }, [response, router]);
}

/** Whether "Not now" was tapped on the Map's alerts card. Kept on this phone, not on the account. */
export async function isAlertCardDismissed() {
  return (await AsyncStorage.getItem(CARD_KEY).catch(() => null)) === 'yes';
}

export function dismissAlertCard() {
  AsyncStorage.setItem(CARD_KEY, 'yes').catch((error) => {
    console.warn('Keeping the alerts card closed failed:', error);
  });
}
