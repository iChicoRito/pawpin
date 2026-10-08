export const MAX_PHOTOS = 3;

export type ReportUrgency = 'critical' | 'needs_help_soon' | 'just_sighted';

/** Where the phone was at one moment. */
export type ReportPlace = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

export type ReportPhoto = {
  uri: string;
  /** ISO time of the tap on the shutter. */
  takenAt: string;
  /** Where the phone was at that tap. */
  place: ReportPlace;
};

/** A report as it exists on the phone before it is sent. */
export type ReportDraft = ReportPlace & {
  /** Made once, with the first photo. Names the photo folder when the report is sent. */
  id: string;
  photos: ReportPhoto[];
  animalType: string;
  size: string;
  color: string;
  condition: string;
  landmark: string;
  urgency: ReportUrgency | null;
};

/** Starts a draft from its first photo. The report's place is that photo's place and is never read again. */
export function startDraft(photo: ReportPhoto): ReportDraft {
  return {
    ...photo.place,
    id: Date.now().toString(),
    photos: [photo],
    animalType: '',
    size: '',
    color: '',
    condition: '',
    landmark: '',
    urgency: null,
  };
}
