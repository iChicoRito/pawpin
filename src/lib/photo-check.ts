import ImageLabeling from '@react-native-ml-kit/image-labeling';

type Label = { text: string; confidence: number };

/** What the check says about a report's photos. `unknown` means it could not run, never a "no". */
export type PhotoCheck = 'animal' | 'none' | 'unknown';

/**
 * The labels that count as an animal, lower case. Copied from the model's own list of 435 labels:
 * https://developers.google.com/ml-kit/vision/image-labeling/label-map
 * Left out because they also mean something else: boxer, cavalier, himalayan, shikoku, herd.
 */
export const ANIMAL_LABELS = [
  'dog',
  'cat',
  'pet',
  'bird',
  'duck',
  'waterfowl',
  'penguin',
  'horse',
  'cattle',
  'bull',
  'bear',
  'seal',
  'gerbil',
  'turtle',
  'crocodile',
  'pomacentridae',
  'insect',
  'butterfly',
  'larva',
  // Breeds.
  'shetland sheepdog',
  'cairn terrier',
  'basset hound',
  'dalmatian',
  'ragdoll',
  'sphynx',
  'pixie-bob',
];

/**
 * A label at least this sure counts. Settled with the owner on 12 October 2026: the least sure
 * animal seen was 0.71, and photos with no animal gave no animal label at all.
 */
export const MIN_CONFIDENCE = 0.5;

export function showsAnimal(labels: Label[]) {
  return labels.some(
    (label) =>
      label.confidence >= MIN_CONFIDENCE && ANIMAL_LABELS.includes(label.text.toLowerCase())
  );
}

/** Looks at each photo on the phone, with no internet. One photo with an animal is enough. */
export async function checkPhotos(uris: string[]): Promise<PhotoCheck> {
  try {
    for (const uri of uris) {
      const labels = await ImageLabeling.label(uri);
      if (__DEV__) {
        console.log(
          'Photo labels:',
          labels.map((label) => `${label.text} ${label.confidence.toFixed(2)}`).join(', ') || 'none'
        );
      }
      if (showsAnimal(labels)) return 'animal';
    }
    return 'none';
  } catch (error) {
    // The check must never stand in a report's way.
    console.warn('Checking the photos failed:', error);
    return 'unknown';
  }
}
