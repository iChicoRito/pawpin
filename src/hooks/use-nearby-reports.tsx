import * as Location from 'expo-location';
import { createContext, use, useRef, useState, type PropsWithChildren } from 'react';

import { DEFAULT_RADIUS_M, fetchNearbyReports, type NearbyReport } from '@/lib/nearby';
import type { ReportPlace } from '@/lib/reports';

/** How long to wait for the phone to find itself before saying it failed. */
const LOCATION_WAIT_MS = 15_000;

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

  async function search(radius: number, known: ReportPlace | null) {
    const request = ++latest.current;
    setStatus('loading');

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
      setPlace(here);
      setFailure('network');
      setStatus('failed');
    }
  }

  return (
    <NearbyReportsContext
      value={{
        reports,
        place,
        radiusM,
        status,
        failure,
        refresh: () => search(radiusM, null),
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
