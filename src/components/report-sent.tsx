import { Button } from 'heroui-native';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Each photo's size in bytes before and after shrinking. Empty when nothing was uploaded this time. */
export type PhotoSizes = { before: number; after: number }[];

/** 3481234 becomes "3.3 MB"; 181234 becomes "177 KB". */
function readableSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/** Shown after a report is saved, whether it went on the first try or a later one. */
export function ReportSent({ photoSizes, onDone }: { photoSizes: PhotoSizes; onDone: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedText type="subtitle" role="heading">
        Report sent
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        Thank you. The report is saved with its photos and exact location.
      </ThemedText>
      {/* Development builds only: proof that photos were shrunk before sending. */}
      {__DEV__ &&
        photoSizes.map((size, index) => (
          <ThemedText key={index} type="small" themeColor="textSecondary">
            Photo {index + 1}: {readableSize(size.before)} sent as {readableSize(size.after)}
          </ThemedText>
        ))}
      <Button style={styles.action} onPress={onDone}>
        Report another
      </Button>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.three,
  },
});
