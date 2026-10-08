export const MAX_PHOTOS = 3;
/** A reading worse than this many meters makes the form ask the reporter to check the pin. */
export const POOR_ACCURACY_M = 50;

export type ReportUrgency = 'critical' | 'needs_help_soon' | 'just_sighted';

// The value is what gets saved; the label is what the reporter reads.
export const ANIMAL_TYPES = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'other', label: 'Other' },
] as const;

export const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
] as const;

export const CONDITIONS = [
  { value: 'injured', label: 'Injured' },
  { value: 'sick', label: 'Sick' },
  { value: 'healthy', label: 'Looks healthy' },
  { value: 'unsure', label: 'Not sure' },
] as const;

// Values match the report_urgency type in the database.
export const URGENCIES: readonly { value: ReportUrgency; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'needs_help_soon', label: 'Needs help soon' },
  { value: 'just_sighted', label: 'Just sighted' },
];

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
