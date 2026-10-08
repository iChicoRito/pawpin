import { Image } from 'expo-image';
import { Dialog } from 'heroui-native';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

type PhotoThumbProps = {
  uri: string;
  /** "Photo 1". Read out for the small picture and shown as the title of the large one. */
  label: string;
  /** Size and corners of the small picture. */
  style: StyleProp<ViewStyle>;
};

/** A small picture of a report photo. Tapping it opens the whole photo in a dialog. */
export function PhotoThumb({ uri, label, style }: PhotoThumbProps) {
  return (
    <Dialog>
      <Dialog.Trigger asChild>
        {/* The touch area reaches past small pictures, such as the ones beside the shutter. */}
        <Pressable
          role="button"
          aria-label={`View ${label.toLowerCase()}`}
          hitSlop={4}
          style={[style, styles.clip]}>
          <Image source={{ uri }} style={styles.fill} />
        </Pressable>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>{label}</Dialog.Title>
          {/* The whole photo, never cropped. */}
          <Image source={{ uri }} contentFit="contain" style={styles.whole} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  whole: {
    width: '100%',
    aspectRatio: 3 / 4,
    marginTop: Spacing.three,
    borderRadius: Spacing.two,
  },
});
