import type { ReportPlace, ReportUrgency } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

/** How far to search, in meters. Chosen on the Map and the List; not saved to the profile. */
export const RADIUS_CHOICES = [
  { value: 1000, label: '1 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 25000, label: '25 km' },
] as const;

export const DEFAULT_RADIUS_M = 5000;

// Pin colors. The same on the light and the dark map, each with a white edge to set it off.
// Each is 3:1 or better against white.
export const URGENCY_COLORS: Record<ReportUrgency, string> = {
  critical: '#C62828',
  needs_help_soon: '#C2570C',
  just_sighted: '#1565C0',
};

/** A report someone else can still help with, as the nearby search hands it back. */
export type NearbyReport = {
  id: string;
  reporterId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  landmark: string | null;
  animalType: string | null;
  size: string | null;
  color: string | null;
  condition: string | null;
  urgency: ReportUrgency;
  photos: string[];
  status: 'reported' | 'responding';
  photoTakenAt: string | null;
  createdAt: string;
  /** From the viewer's place at the time of the search. */
  distanceM: number;
  /** Who is on the way, while the status is `responding`. */
  rescuerId: string | null;
};

/** Active reports within `radiusM` of a place, nearest first. Throws if the search fails. */
export async function fetchNearbyReports(place: ReportPlace, radiusM: number) {
  const { data, error } = await supabase.rpc('nearby_reports', {
    lat: place.latitude,
    lng: place.longitude,
    radius_m: radiusM,
  });
  if (error) throw error;

  // The database's names on the left of each pair are the columns of nearby_reports.
  return (data as Record<string, any>[]).map(
    (row): NearbyReport => ({
      id: row.id,
      reporterId: row.reporter_id,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.location_accuracy_m,
      landmark: row.landmark,
      animalType: row.animal_type,
      size: row.size,
      color: row.color,
      condition: row.condition,
      urgency: row.urgency,
      photos: row.photos ?? [],
      status: row.status,
      photoTakenAt: row.photo_taken_at,
      createdAt: row.created_at,
      distanceM: row.distance_m,
      rescuerId: row.rescuer_id,
    })
  );
}
