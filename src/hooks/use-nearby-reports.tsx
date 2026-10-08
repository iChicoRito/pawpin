import * as Location from 'expo-location';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { DEFAULT_RADIUS_M, fetchNearbyReports, type NearbyReport } from '@/lib/nearby';
import type { ReportPlace } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

/** How long to wait for the phone to find itself before saying it failed. */
const LOCATION_WAIT_MS = 15_000;
/** How long the reports must stay unchanged before a live change is fetched. */
const LIVE_WAIT_MS = 500;

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
  const [reports, setReports] = useState<NearbyReport[]>([]);
  const [place, setPlace] = useState<ReportPlace | null>(null);
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [status, setStatus] = useState<NearbyState['status']>('idle');
  const [failure, setFailure] = useState<NearbyState['failure']>(null);
  // Counts searches, so an answer that arrives after a newer search began is dropped.
  const latest = useRef(0);

  /**
   * `quiet` is for a search nobody asked for by hand: a live change, or coming back to the app.
   * It shows no loading state, and if it fails, what is on screen stays as it was.
   */
  async function search(radius: number, known: ReportPlace | null, quiet = false) {
    const request = ++latest.current;
    if (!quiet) setStatus('loading');

    let here = known;
    if (!here) {
      try {
        // Read once, not watched. A rough fix is enough to search by, and it arrives fast.
        const { coords } = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Location timed out')), LOCATION_WAIT_MS)
          ),
        ]);
        here = { latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy };
      } catch (error) {
        // Indoors or just after waking, the phone often cannot work out a new position in time.
        // An older one is still good enough to search by: the phone's own, then the last search's.
        console.warn('Reading a fresh location failed:', error);
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        here = last
          ? {
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
              accuracyM: last.coords.accuracy,
            }
          : place;
      }
      if (!here) {
        if (request === latest.current) {
          setFailure('location');
          setStatus('failed');
        }
        return;
      }
    }

    try {
      const found = await fetchNearbyReports(here, radius);
      if (request !== latest.current) return;
      setPlace(here);
      setReports(found);
      setFailure(null);
      setStatus('ready');
    } catch (error) {
      console.warn('Loading nearby reports failed:', error);
      if (request !== latest.current) return;
      if (quiet) {
        // A quiet search can overtake one that was showing "loading", whose own answer is then
        // dropped. Do not leave the screen waiting for it.
        setStatus((current) => (current === 'loading' ? 'ready' : current));
        return;
      }
      setPlace(here);
      setFailure('network');
      setStatus('failed');
    }
  }

  // The quiet search with the distance and place of this render. Kept in a ref so the listener
  // below, which is set up once, never searches with an old distance.
  const reloadNow = useRef(async () => {});
  useEffect(() => {
    reloadNow.current = async () => {
      if (place) await search(radiusM, place, true);
    };
  });

  // Live changes: a claim, a give-up, an outcome, or a new report on any phone changes a row in
  // reports. Each change runs the same nearby search again, so distance, order, and "still active"
  // stay the database's answer. The location is not read again.
  const hasPlace = place !== null;
  useEffect(() => {
    if (!hasPlace) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Changes often come in a burst. One search, half a second after the last of them.
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadNow.current(), LIVE_WAIT_MS);
    };
    const channel = supabase
      .channel('reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, onChange)
      .subscribe();
    // Changes made while the app was in the background may have been missed.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') onChange();
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [hasPlace]);

  return (
    <NearbyReportsContext
      value={{
        reports,
        place,
        radiusM,
        status,
        failure,
        refresh: () => search(radiusM, null),
        reload: async () => {
          if (place) await search(radiusM, place, true);
        },
        setRadius: (next) => {
          setRadiusM(next);
          search(next, place);
        },
      }}>
      {children}
    </NearbyReportsContext>
  );
}

export function useNearbyReports() {
  return use(NearbyReportsContext);
}
