import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { ReportPlace } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { playSound } from '@/lib/sounds';

// Phones only. Browsers get alerts.web.ts.

/** Android sorts alerts into channels. PawPin has the one. */
const CHANNEL = 'default';
const CARD_KEY = 'pawpin.alerts-card-dismissed';
/** How long the phone gets to hand over its push token before the try is given up. */
const TOKEN_WAIT_MS = 15_000;
let registrationQueue: Promise<unknown> = Promise.resolve();
let registrationPaused = false;
let registrationEpoch = 0;
let savedRegistration: string | null = null;

function serializeRegistration<T>(action: () => Promise<T>): Promise<T> {
  const next = registrationQueue.then(action);
  registrationQueue = next.catch(() => {});
  return next;
}

export function pauseAlertRegistration(paused: boolean) {
  registrationPaused = paused;
  registrationEpoch++;
  savedRegistration = null;
}

async function currentAccountIs(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id === userId;
}

/** Detachment must finish while the outgoing account's credentials still exist. */
export function unregisterForAlerts(userId: string) {
  return serializeRegistration(async () => {
    if (!(await currentAccountIs(userId))) throw new Error('The current account changed.');
    const { error } = await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
    if (error) throw error;
    savedRegistration = null;
  });
}

// Foreground reports share realtime's ID to avoid a system sound plus the app's pop.
// Android can suppress heads-up banners without system audio; the notification list remains.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const reportId = notification.request.content.data?.reportId;
    const appSound = AppState.currentState === 'active' && typeof reportId === 'string';
    if (appSound) playSound('notification', `report:${reportId}`);
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: !appSound,
      shouldSetBadge: false,
    };
  },
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
export async function registerForAlerts(userId: string, isCurrent = () => true) {
  if (registrationPaused) return;
  const epoch = registrationEpoch;
  const valid = () => !registrationPaused && epoch === registrationEpoch && isCurrent();
  try {
    await serializeRegistration(async () => {
      if (!valid()) return;
      await ensureChannel();
      const permission = await Notifications.getPermissionsAsync();
      if (!valid()) return;
      if (!permission.granted) {
        savedRegistration = null;
        return;
      }
      // Reads the project id from app.json (`extra.eas.projectId`) and throws when there is none.
      // The read can hang for good when Google's push service does not answer. Without a limit it
      // would hold the queue, and signing out waits on that queue.
      const { data: token } = await Promise.race([
        Notifications.getExpoPushTokenAsync(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Reading the push token timed out.')), TOKEN_WAIT_MS),
        ),
      ]);
      if (!valid() || !(await currentAccountIs(userId)) || !valid()) return;
      const key = JSON.stringify([userId, token, permission]);
      if (savedRegistration === key) return;
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);
      if (error) throw error;
      if (valid()) savedRegistration = key;
    });
  } catch (error) {
    console.warn('Saving the alert pass failed:', error);
  }
}

/**
 * Saves where the user was at their last fresh location read. New reports alert the people whose
 * last place is near. Only logged on failure, so it can never fail the nearby search it rides on.
 */
export async function saveLastPlace(userId: string, place: ReportPlace, isCurrent = () => true) {
  const epoch = registrationEpoch;
  const valid = () => !registrationPaused && epoch === registrationEpoch && isCurrent();
  try {
    await serializeRegistration(async () => {
      if (!valid() || !(await currentAccountIs(userId)) || !valid()) return;
      const { error } = await supabase
        .from('profiles')
        // PostGIS points are longitude first, then latitude.
        .update({ last_location: `SRID=4326;POINT(${place.longitude} ${place.latitude})` })
        .eq('id', userId);
      if (error) throw error;
    });
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
    savedRegistration = null;
    if (!userId) return;
    let active = true;
    const register = () => registerForAlerts(userId, () => active);
    register();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') register();
    });
    return () => {
      active = false;
      savedRegistration = null;
      subscription.remove();
    };
  }, [userId]);
}

/** One id an alert carries under `key`, or `null` when it carries none or something else. */
function idOf(response: Notifications.NotificationResponse | null | undefined, key: string) {
  const id = response?.notification.request.content.data?.[key];
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id : null;
}

/** The report an alert is about, or `null` when it names none. */
export function reportIdOf(response: Notifications.NotificationResponse | null | undefined) {
  return idOf(response, 'reportId');
}

/**
 * Where a tapped alert leads. A chat message opens its chat. An alert that names a notification
 * opens that notification's page. One that names only a report is a stray nearby, or an outcome
 * (0017 sends those without the notification's id): the outcome's notification is looked up and
 * opened, and anything else, or a failed look, opens the report.
 */
export async function alertTargetOf(response: Notifications.NotificationResponse | null | undefined) {
  const claimId = idOf(response, 'claimId');
  if (claimId) return { pathname: '/chat/[claimId]', params: { claimId } } as const;
  const notificationId = idOf(response, 'notificationId');
  if (notificationId) return { pathname: '/notification/[id]', params: { id: notificationId } } as const;
  const reportId = reportIdOf(response);
  if (!reportId) return null;
  // Only the viewer's own rows are handed back, so a stray nearby finds none.
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('report_id', reportId)
    .in('kind', ['rescued', 'not_found'])
    .limit(1)
    .maybeSingle();
  return data
    ? ({ pathname: '/notification/[id]', params: { id: data.id as string } } as const)
    : ({ pathname: '/report/[id]', params: { id: reportId } } as const);
}

/**
 * Opens what a tapped alert is about: the tap that opened the app, and taps while it runs. Used
 * once, inside the signed-in part of the app, so a signed-out phone opens nothing.
 */
export function useAlertTaps() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  // The alert already opened. The same tap is handed over again on every render.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    const alert = response?.notification.request.identifier;
    if (!reportIdOf(response) || !alert || opened.current === alert) return;
    opened.current = alert;
    alertTargetOf(response)
      // The look failed outright: the report is still the right place to land.
      .catch(() => ({ pathname: '/report/[id]', params: { id: reportIdOf(response)! } }) as const)
      .then((target) => {
        if (target) router.push(target);
      });
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
