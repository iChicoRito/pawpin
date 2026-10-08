import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

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

const PHOTO_BUCKET = 'report-photos';
/** Wide enough to recognise an animal, small enough to send on a weak signal. */
const PHOTO_MAX_WIDTH = 1280;
const PHOTO_QUALITY = 0.7;

/** The message of the error thrown when the database refuses a guest's fourth report in 24 hours. */
export const GUEST_LIMIT_ERROR = 'guest_report_limit';

/** Saves a smaller JPEG copy of a photo. A photo already narrow enough is not made bigger. */
async function shrinkPhoto(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  // Rendered once untouched to learn the true width, after the phone's rotation is applied.
  const original = await context.renderAsync();
  const image =
    original.width > PHOTO_MAX_WIDTH
      ? await context.resize({ width: PHOTO_MAX_WIDTH }).renderAsync()
      : original;
  return image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
}

/**
 * Sends a report: photos first, then the row that links to them. Throws if any step fails.
 * Returns each photo's size in bytes before and after shrinking.
 */
export async function submitReport(draft: ReportDraft, userId: string) {
  if (!draft.urgency) throw new Error('A report needs an urgency.');

  const links: string[] = [];
  const sizes: { before: number; after: number }[] = [];

  for (const [index, photo] of draft.photos.entries()) {
    const shrunk = await shrinkPhoto(photo.uri);
    const bytes = await new File(shrunk.uri).arrayBuffer();
    // The same path on every try, so sending again overwrites the file and leaves no second copy.
    const path = `${userId}/${draft.id}/${index + 1}.jpg`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    links.push(supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl);
    sizes.push({ before: new File(photo.uri).size, after: bytes.byteLength });
  }

  const { error } = await supabase.from('reports').insert({
    reporter_id: userId,
    // Longitude first. This is the pin's final place, after the reporter moved the map.
    location: `SRID=4326;POINT(${draft.longitude} ${draft.latitude})`,
    location_accuracy_m: draft.accuracyM,
    photo_taken_at: draft.photos[0].takenAt,
    photos: links,
    animal_type: draft.animalType || null,
    size: draft.size || null,
    color: draft.color.trim() || null,
    condition: draft.condition || null,
    landmark: draft.landmark.trim() || null,
    urgency: draft.urgency,
  });
  if (error) {
    throw new Error(error.message.includes(GUEST_LIMIT_ERROR) ? GUEST_LIMIT_ERROR : error.message);
  }

  return sizes;
}
