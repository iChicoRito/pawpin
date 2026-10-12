import * as Location from 'expo-location';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/hooks/use-session';
import { saveLastPlace } from '@/lib/alerts';
import { DEFAULT_RADIUS_M, fetchNearbyReports, type NearbyReport } from '@/lib/nearby';
import type { ReportPlace } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { playSound } from '@/lib/sounds';

/** How long to wait for the phone to find itself before saying it failed. */
const LOCATION_WAIT_MS = 15_000;
/** How long the reports must stay unchanged before a live change is fetched. */
const LIVE_WAIT_MS = 500;
const LIVE_MAX_WAIT_MS = 2000;

type NearbyRequest = {
  key: string;
  radius: number;
  place: ReportPlace | null;
  controller: AbortController;
  manual: boolean;
  promise: Promise<void>;
};

type NearbyState = {
  /** Nearest first. Kept on screen while a newer search runs or fails. */
  reports: NearbyReport[];
  /** Where the viewer was at the last search. `null` until the first one finishes. */
  place: ReportPlace | null;
  radiusM: number;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  /** Which step of the last search failed. */
  failure: 'location' | 'network' | null;
  /** Reads the viewer's location again and searches. The caller must hold the location permission. */
  refresh: () => Promise<void>;
  /**
   * Searches again from the place already read, after a report changed. No new location read, and
   * nothing on screen says it is loading: the reports just change.
   */
  reload: () => Promise<void>;
  /** Searches again at a new distance, from the place already read. */
  setRadius: (radiusM: number) => void;
};

const NearbyReportsContext = createContext<NearbyState>({
  reports: [],
  place: null,
  radiusM: DEFAULT_RADIUS_M,
  status: 'idle',
  failure: null,
  refresh: async () => {},
  reload: async () => {},
  setRadius: () => {},
});

/** One copy of the nearby reports, shared by the Map, the List, and the report detail. */
export function NearbyReportsProvider({ children }: PropsWithChildren) {
  const userId = useSession().session?.user.id;
  const [reports, setReports] = useState<NearbyReport[]>([]);
  const [place, setPlace] = useState<ReportPlace | null>(null);
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [status, setStatus] = useState<NearbyState['status']>('idle');
  const [failure, setFailure] = useState<NearbyState['failure']>(null);
  // Counts searches, so an answer that arrives after a newer search began is dropped.
  const latest = useRef(0);
  const account = useRef(userId);
  const locationTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const inFlight = useRef<NearbyRequest | null>(null);
  const interruptedInitial = useRef<{ place: ReportPlace | null; manual: boolean } | null>(null);
  const mounted = useRef(true);
  const foreground = useRef(!AppState?.currentState || AppState.currentState === 'active');
  const dirty = useRef(false);
  const settled = useRef(() => {});
  const lastPlace = useRef(place);
  const [stateAccount, setStateAccount] = useState(userId);

  if (stateAccount !== userId) {
    setStateAccount(userId);
    setPlace(null);
    setReports([]);
    setFailure(null);
    setStatus('idle');
  }

  useEffect(() => {
    account.current = userId;
    mounted.current = true;
    if (AppState?.currentState) foreground.current = AppState.currentState === 'active';
    lastPlace.current = null;
    dirty.current = false;
    interruptedInitial.current = null;
    const requests = latest;
    requests.current++;
    const timers = locationTimers.current;
    return () => {
      requests.current++;
      mounted.current = false;
      inFlight.current?.controller.abort();
      inFlight.current = null;
      interruptedInitial.current = null;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [userId]);

  /**
   * `quiet` is for a search nobody asked for by hand: a live change, or coming back to the app.
   * It shows no loading state, and if it fails, what is on screen stays as it was.
   */
  function search(radius: number, known: ReportPlace | null, quiet = false): Promise<void> {
    if (!userId || account.current !== userId || !mounted.current) return Promise.resolve();
    if (!foreground.current) {
      dirty.current = true;
      return Promise.resolve();
    }
    interruptedInitial.current = null;
    const key = JSON.stringify([userId, radius, known?.latitude ?? null, known?.longitude ?? null]);
    const current = inFlight.current;
    if (current && (current.key === key || (quiet && current.manual && current.radius === radius))) {
      if (quiet && current.key !== key && (!current.place || current.place.latitude !== known?.latitude ||
          current.place.longitude !== known?.longitude)) dirty.current = true;
      if (!quiet) {
        current.manual = true;
        setStatus('loading');
      }
      return current.promise;
    }
    current?.controller.abort();
    const request = ++latest.current;
    const work: NearbyRequest = { key, radius, place: known, controller: new AbortController(), manual: !quiet, promise: Promise.resolve() };
    inFlight.current = work;
    const valid = () => mounted.current && foreground.current && !work.controller.signal.aborted &&
      request === latest.current && account.current === userId;
    if (!quiet) setStatus('loading');
    work.promise = (async () => {
      let here = known;
      if (!here) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancelLocation: (() => void) | undefined;
        try {
          const cancelled = new Promise<never>((_, reject) => {
            cancelLocation = () => {
              if (timer !== undefined) {
                clearTimeout(timer);
                locationTimers.current.delete(timer);
              }
              reject(Object.assign(new Error('Location cancelled'), { name: 'AbortError' }));
            };
            work.controller.signal.addEventListener('abort', cancelLocation, { once: true });
          });
          // Expo's one-shot GPS API has no abort parameter. Race cancellation and guard its late result.
          const { coords } = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), cancelled,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('Location timed out')), LOCATION_WAIT_MS);
              locationTimers.current.add(timer);
            }),
          ]);
          here = { latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy };
          if (!valid()) return;
          saveLastPlace(userId, here, valid);
        } catch (error) {
          if (!valid()) return;
          console.warn('Reading a fresh location failed:', error);
          const last = await Location.getLastKnownPositionAsync().catch(() => null);
          if (!valid()) return;
          here = last ? {
            latitude: last.coords.latitude, longitude: last.coords.longitude, accuracyM: last.coords.accuracy,
          } : lastPlace.current;
        } finally {
          if (cancelLocation) work.controller.signal.removeEventListener('abort', cancelLocation);
          if (timer !== undefined) {
            clearTimeout(timer);
            locationTimers.current.delete(timer);
          }
        }
        if (!here) {
          if (valid()) {
            setFailure('location');
            setStatus('failed');
            playSound('error');
          }
          return;
        }
      }
      try {
        if (!valid()) return;
        work.place = here;
        const found = await fetchNearbyReports(here, radius, work.controller.signal);
        if (!valid()) return;
        lastPlace.current = here;
        setPlace(here);
        setReports(found);
        setFailure(null);
        setStatus('ready');
      } catch (error) {
        if (!valid()) return;
        if ((error as { name?: string })?.name === 'AbortError') {
          setStatus((value) => value === 'loading' ? (lastPlace.current ? 'ready' : 'idle') : value);
          return;
        }
        console.warn('Loading nearby reports failed:', error);
        if (!work.manual) {
          setStatus((value) => value === 'loading' ? (lastPlace.current ? 'ready' : 'idle') : value);
          return;
        }
        lastPlace.current = here;
        setPlace(here);
        setFailure('network');
        setStatus('failed');
        playSound('error');
      }
    })().finally(() => {
      if (inFlight.current !== work) return;
      inFlight.current = null;
      settled.current();
    });
    return work.promise;
  }

  // The quiet search with the distance and place of this render. Kept in a ref so the listener
  // below, which is set up once, never searches with an old distance.
  const reloadNow = useRef(async () => {});
  useEffect(() => {
    reloadNow.current = async () => {
      if (stateAccount !== userId) return;
      const interrupted = interruptedInitial.current;
      interruptedInitial.current = null;
      if (lastPlace.current) await search(radiusM, lastPlace.current, true);
      else if (interrupted) await search(radiusM, interrupted.place, !interrupted.manual);
    };
  });

  // Live changes: a claim, a give-up, an outcome, or a new report on any phone changes a row in
  // reports. Each change runs the same nearby search again, so distance, order, and "still active"
  // stay the database's answer. The location is not read again.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      clearTimeout(timer);
      clearTimeout(maxTimer);
      timer = maxTimer = undefined;
    };
    const reconcile = () => {
      clearTimers();
      if (!active || account.current !== userId || !foreground.current || inFlight.current) return;
      dirty.current = false;
      void reloadNow.current();
    };
    settled.current = () => {
      if (dirty.current && timer === undefined && maxTimer === undefined) reconcile();
    };
    const onChange = (payload?: RealtimePostgresChangesPayload<{ id: string }>) => {
      if (!active || account.current !== userId) return;
      // Sound each insert before debouncing the search. Same user's next report has a new ID.
      if (payload?.eventType === 'INSERT' && typeof payload.new.id === 'string') {
        playSound('notification', `report:${payload.new.id}`);
      }
      dirty.current = true;
      if (!foreground.current) return;
      clearTimeout(timer);
      timer = setTimeout(reconcile, LIVE_WAIT_MS);
      maxTimer ??= setTimeout(reconcile, LIVE_MAX_WAIT_MS);
    };
    const channel = supabase
      .channel('reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, onChange)
      .subscribe();
    // Changes made while the app was in the background may have been missed.
    const appState = AppState.addEventListener('change', (state) => {
      if (!active || account.current !== userId) return;
      const wasForeground = foreground.current;
      foreground.current = state === 'active';
      if (!foreground.current) {
        dirty.current = true;
        clearTimers();
        latest.current++;
        if (!lastPlace.current && inFlight.current) {
          interruptedInitial.current = { place: inFlight.current.place, manual: inFlight.current.manual };
        }
        inFlight.current?.controller.abort();
        inFlight.current = null;
        setStatus((value) => value === 'loading' ? (lastPlace.current ? 'ready' : 'idle') : value);
      } else if (!wasForeground && dirty.current) {
        reconcile();
      }
    });
    return () => {
      clearTimers();
      active = false;
      settled.current = () => {};
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <NearbyReportsContext
      value={{
        reports: stateAccount === userId ? reports : [],
        place: stateAccount === userId ? place : null,
        radiusM,
        status: stateAccount === userId ? status : 'idle',
        failure: stateAccount === userId ? failure : null,
        refresh: () => search(radiusM, null),
        reload: async () => {
          if (stateAccount === userId && place) await search(radiusM, place, true);
        },
        setRadius: (next) => {
          setRadiusM(next);
          search(next, stateAccount === userId ? place : null);
        },
      }}>
      {children}
    </NearbyReportsContext>
  );
}

export function useNearbyReports() {
  return use(NearbyReportsContext);
}
