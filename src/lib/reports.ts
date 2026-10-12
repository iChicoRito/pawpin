import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
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
] as const;

// Coat colors and the common mixes. The value is saved as it reads, so a rescuer's list needs no lookup.
export const COLORS = [
  { value: 'black', label: 'Black' },
  { value: 'white', label: 'White' },
  { value: 'brown', label: 'Brown' },
  { value: 'gray', label: 'Gray' },
  { value: 'orange', label: 'Orange' },
  { value: 'cream', label: 'Cream' },
  { value: 'black and white', label: 'Black and white' },
  { value: 'brown and white', label: 'Brown and white' },
  { value: 'orange and white', label: 'Orange and white' },
  { value: 'gray and white', label: 'Gray and white' },
  { value: 'black and brown', label: 'Black and brown' },
  { value: 'three colors', label: 'Three colors' },
  { value: 'other', label: 'Other' },
] as const;

// Values match the report_urgency type in the database.
export const URGENCIES: readonly { value: ReportUrgency; label: string; hint: string }[] = [
  { value: 'critical', label: 'Critical', hint: 'Badly hurt or in danger right now.' },
  {
    value: 'needs_help_soon',
    label: 'Needs help soon',
    hint: 'Hurt, sick, or weak, but not in danger right now.',
  },
  { value: 'just_sighted', label: 'Just sighted', hint: 'Looks fine. Sharing where it was seen.' },
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
  /**
   * Made once, with the first photo. It becomes the saved report's id and names its photo folder,
   * so sending the same draft twice can never make a second report.
   */
  id: string;
  photos: ReportPhoto[];
  animalType: string;
  /** What the reporter typed after choosing "Other". Missing on reports kept by an older version. */
  otherAnimal?: string;
  size: string;
  color: string;
  /** What the reporter typed after choosing "Other" as the color. */
  otherColor?: string;
  condition: string;
  landmark: string;
  urgency: ReportUrgency | null;
  /**
   * The photo check saw no animal and the reporter went on anyway. Decided once, at the camera.
   * Missing on reports kept by an older version.
   */
  noAnimalSeen?: boolean;
};

// Values match the report_status type in the database. Said the way a person would say them.
export const REPORT_STATUSES: readonly { value: string; label: string }[] = [
  { value: 'reported', label: 'Waiting for a rescuer' },
  { value: 'responding', label: 'Someone is on the way' },
  { value: 'rescued', label: 'Rescued' },
  { value: 'not_found', label: 'Not found' },
  { value: 'closed', label: 'Closed' },
];

/**
 * What to show for a saved value: its label from a choice list, or the value itself when the
 * reporter typed it after choosing "Other". Empty when nothing was saved.
 */
export function labelFor(
  options: readonly { value: string; label: string }[],
  value: string | null
) {
  return options.find((option) => option.value === value)?.label ?? value ?? '';
}

/** The animal as saved: "dog", "cat", or the typed kind when the reporter chose "Other". */
export function animalOf(draft: ReportDraft) {
  return (draft.animalType === 'other' && draft.otherAnimal?.trim()) || draft.animalType;
}

/** The color as saved: a listed color, or the typed one when the reporter chose "Other". */
export function colorOf(draft: ReportDraft) {
  return draft.color === 'other' ? (draft.otherColor?.trim() ?? '') : draft.color.trim();
}

/** A random id in the standard UUID shape, which the database's id column expects. */
function newId() {
  // ponytail: Math.random is enough to keep two reports apart, and the access rules do the guarding.
  // Use expo-crypto's randomUUID if ids ever need to be unguessable; that needs a new build.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (slot) => {
    const digit = Math.floor(Math.random() * 16);
    return (slot === 'x' ? digit : (digit & 0x3) | 0x8).toString(16);
  });
}

/** Starts a draft from its first photo. The report's place is that photo's place and is never read again. */
export function startDraft(photo: ReportPhoto): ReportDraft {
  return {
    ...photo.place,
    id: newId(),
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
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

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

  // An earlier try may have saved the report without the phone hearing back. Asked first, not
  // left to the database to refuse, because the guest limit would answer before that refusal.
  const earlier = await supabase.from('reports').select('id').eq('id', draft.id).maybeSingle();
  if (earlier.error) throw earlier.error;
  if (earlier.data) return [];

  if (
    draft.photos.length < 1 || draft.photos.length > MAX_PHOTOS ||
    !animalOf(draft).trim() || animalOf(draft).length > 40 ||
    (draft.animalType === 'other' && draft.otherAnimal !== undefined && !draft.otherAnimal.trim()) ||
    (draft.color === 'other' && draft.otherColor !== undefined && !draft.otherColor.trim()) ||
    colorOf(draft).length > 40 || draft.landmark.trim().length > 120 ||
    (draft.size !== '' && !SIZES.some(({ value }) => value === draft.size)) ||
    (draft.condition !== '' && !CONDITIONS.some(({ value }) => value === draft.condition)) ||
    !URGENCIES.some(({ value }) => value === draft.urgency) ||
    !Number.isFinite(draft.latitude) || Math.abs(draft.latitude) > 90 ||
    !Number.isFinite(draft.longitude) || Math.abs(draft.longitude) > 180 ||
    (draft.accuracyM !== null && (!Number.isFinite(draft.accuracyM) || draft.accuracyM < 0))
  ) throw new Error('Invalid report input.');

  await flushReleasedUploads(userId);
  const reservation = await supabase.rpc('prepare_report_upload', {
    p_report_id: draft.id,
    p_photo_count: draft.photos.length,
  });
  if (reservation.error) {
    throw new Error(reservation.error.message.includes(GUEST_LIMIT_ERROR) ? GUEST_LIMIT_ERROR : reservation.error.message);
  }
  if (reservation.data?.saved) return [];

  const links: string[] = [];
  const sizes: { before: number; after: number }[] = [];

  for (const [index, photo] of draft.photos.entries()) {
    const shrunk = await shrinkPhoto(photo.uri);
    const bytes = await new File(shrunk.uri).arrayBuffer();
    if (bytes.byteLength > PHOTO_MAX_BYTES) throw new Error('Photo exceeds upload limit.');
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
    id: draft.id,
    reporter_id: userId,
    // Longitude first. This is the pin's final place, after the reporter moved the map.
    location: `SRID=4326;POINT(${draft.longitude} ${draft.latitude})`,
    location_accuracy_m: draft.accuracyM,
    photo_taken_at: draft.photos[0].takenAt,
    photos: links,
    animal_type: animalOf(draft) || null,
    size: draft.size || null,
    color: colorOf(draft) || null,
    condition: draft.condition || null,
    landmark: draft.landmark.trim() || null,
    urgency: draft.urgency,
    no_animal_seen: draft.noAnimalSeen ?? false,
  });
  if (error) {
    throw new Error(error.message.includes(GUEST_LIMIT_ERROR) ? GUEST_LIMIT_ERROR : error.message);
  }

  return sizes;
}

const UNSENT_KEY = 'pawpin.unsent-report';
const RELEASE_KEY = 'pawpin.upload-releases';
type ReleasedUpload = { userId: string; reportId: string };
let releaseQueue: Promise<unknown> = Promise.resolve();

function withReleaseQueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = releaseQueue.then(operation);
  releaseQueue = result.catch(() => {});
  return result;
}

async function readReleasedUploads(): Promise<ReleasedUpload[]> {
  const raw = await AsyncStorage.getItem(RELEASE_KEY);
  if (!raw) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.some((item) => typeof item?.userId !== 'string' || typeof item?.reportId !== 'string')) {
    throw new Error('Invalid upload release metadata.');
  }
  return items;
}

async function flushReleasedUploads(userId: string) {
  await withReleaseQueue(async () => {
    let items = await readReleasedUploads();
    for (const item of items.filter((entry) => entry.userId === userId)) {
      const { error } = await supabase.rpc('release_report_upload', { p_report_id: item.reportId });
      if (error) throw new Error(error.message);
      items = items.filter((entry) => entry !== item);
      await AsyncStorage.setItem(RELEASE_KEY, JSON.stringify(items));
    }
  });
}

const unsentFolder = () => new Directory(Paths.document, 'unsent-report');
let recoveryQueue: Promise<unknown> = Promise.resolve();

function withRecoveryQueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = recoveryQueue.then(operation);
  recoveryQueue = result.catch(() => {});
  return result;
}

/**
 * Keeps a report that could not be sent, so it survives closing the app. One at a time.
 * Returns the draft with its photos pointing at the kept copies.
 */
export async function saveUnsentReport(draft: ReportDraft, userId: string) {
  return withRecoveryQueue(async () => {
    // Do not delete the previous recovery copy until a replacement is fully saved.
    const folder = new Directory(unsentFolder(), draft.id);
    folder.create({ intermediates: true, idempotent: true });

    const photos: ReportPhoto[] = [];
    for (const [index, photo] of draft.photos.entries()) {
      // The camera's own files are temporary and the phone may delete them.
      const kept = new File(folder, `${index + 1}.jpg`);
      if (photo.uri !== kept.uri) await new File(photo.uri).copy(kept, { overwrite: true });
      photos.push({ ...photo, uri: kept.uri });
    }

    const saved: ReportDraft = { ...draft, photos };
    await AsyncStorage.setItem(UNSENT_KEY, JSON.stringify({ userId, draft: saved }));
    return saved;
  });
}

/** The report kept on this phone for this user, if there is one. */
export async function loadUnsentReport(userId: string): Promise<ReportDraft | null> {
  const raw = await AsyncStorage.getItem(UNSENT_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    // A report kept by someone else who used this phone is never sent under this account.
    return saved.userId === userId ? saved.draft : null;
  } catch {
    return null;
  }
}

export async function discardUnsentReport(userId: string, expectedReportId?: string) {
  if (!userId) throw new Error('Recovery discard requires an account.');
  const discarded = await withRecoveryQueue(async () => {
    const raw = await AsyncStorage.getItem(UNSENT_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.userId !== userId) return;
    const reportId = saved.draft?.id;
    if (typeof reportId !== 'string') throw new Error('Invalid recovery metadata.');
    if (expectedReportId && reportId !== expectedReportId) return false;
    // Persist release intent first: an offline discard must not strand the guest's quota slot.
    await withReleaseQueue(async () => {
      const items = await readReleasedUploads();
      if (!items.some((item) => item.userId === userId && item.reportId === reportId)) {
        await AsyncStorage.setItem(RELEASE_KEY, JSON.stringify([...items, { userId, reportId }]));
      }
    });
    await AsyncStorage.removeItem(UNSENT_KEY);
    const folder = new Directory(unsentFolder(), reportId);
    if (folder.exists) folder.delete();
    return true;
  });
  // Remote work stays outside the recovery lock so another account can save safely while offline.
  if (discarded) await flushReleasedUploads(userId).catch(() => console.warn('Upload release queued until the next submission.'));
}
