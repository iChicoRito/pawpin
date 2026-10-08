import { Button } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReportCamera } from '@/components/report-camera';
import { ReportPermissions } from '@/components/report-permissions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ReportDraft } from '@/lib/reports';

export default function ReportScreen() {
  // No draft means the camera step; a draft means the form step.
  const [draft, setDraft] = useState<ReportDraft | null>(null);

  return (
    <ReportPermissions>
      {draft ? (
        <DraftSummary draft={draft} onRetake={() => setDraft(null)} />
      ) : (
        <ReportCamera onDone={setDraft} />
      )}
    </ReportPermissions>
  );
}

/** Stand-in for the report form: shows what the camera recorded. */
function DraftSummary({ draft, onRetake }: { draft: ReportDraft; onRetake: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={[styles.summary, { paddingTop: insets.top + Spacing.four }]}>
      <ThemedText type="subtitle" role="heading">
        Photo recorded
      </ThemedText>
      <ThemedText>Photos: {draft.photos.length}</ThemedText>
      <ThemedText>Latitude: {draft.latitude}</ThemedText>
      <ThemedText>Longitude: {draft.longitude}</ThemedText>
      <ThemedText>
        Accuracy: {draft.accuracyM == null ? 'not known' : `about ${Math.round(draft.accuracyM)} m`}
      </ThemedText>
      <ThemedText>Taken: {new Date(draft.photos[0].takenAt).toLocaleString()}</ThemedText>
      {/* What each photo recorded by itself, to check the report keeps the first photo's place. */}
      {draft.photos.map((photo, index) => (
        <ThemedText key={photo.uri} type="small" themeColor="textSecondary">
          Photo {index + 1}: {photo.place.latitude}, {photo.place.longitude} at{' '}
          {new Date(photo.takenAt).toLocaleTimeString()}
        </ThemedText>
      ))}
      <Button variant="secondary" style={styles.retake} onPress={onRetake}>
        Retake
      </Button>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  summary: {
    flex: 1,
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  retake: {
    alignSelf: 'flex-start',
    marginTop: Spacing.three,
  },
});
