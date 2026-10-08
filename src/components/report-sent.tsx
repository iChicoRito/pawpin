import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import FirstAidKitIcon from '@hugeicons/core-free-icons/FirstAidKitIcon';
import MapPinIcon from '@hugeicons/core-free-icons/MapPinIcon';
import PaintBoardIcon from '@hugeicons/core-free-icons/PaintBoardIcon';
import PawPrintIcon from '@hugeicons/core-free-icons/PawPrintIcon';
import RulerIcon from '@hugeicons/core-free-icons/RulerIcon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Button, ListGroup, Separator, useThemeColor } from 'heroui-native';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PhotoThumb } from '@/components/report-photo';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  ANIMAL_TYPES,
  animalOf,
  colorOf,
  COLORS,
  CONDITIONS,
  SIZES,
  URGENCIES,
  type ReportDraft,
} from '@/lib/reports';

/** The icon on the toast that says whether a report was sent. */
export function ToastIcon({ status }: { status: 'success' | 'danger' }) {
  const color = useThemeColor(status);
  return (
    <HugeiconsIcon
      icon={status === 'success' ? CheckmarkCircle02Icon : AlertCircleIcon}
      size={22}
      color={color}
    />
  );
}

/** The words the reporter chose from, or the words they typed when the answer is not on the list. */
function wordsFor(list: readonly { value: string; label: string }[], value: string) {
  return list.find((option) => option.value === value)?.label ?? value;
}

type ReportSentProps = {
  /** The report that was just sent. Pass it with no photos if their files are already gone. */
  draft: ReportDraft;
  onDone: () => void;
};

/** Shown after a report is saved, whether it went on the first try or a later one. */
export function ReportSent({ draft, onDone }: ReportSentProps) {
  const insets = useSafeAreaInsets();
  const [accent, accentForeground, muted] = useThemeColor([
    'accent',
    'accent-foreground',
    'muted',
  ]);

  // Only the answers the reporter gave. An empty answer has no line.
  const answers = [
    { icon: PawPrintIcon, label: 'Animal', value: wordsFor(ANIMAL_TYPES, animalOf(draft)) },
    { icon: Alert02Icon, label: 'How urgent', value: wordsFor(URGENCIES, draft.urgency ?? '') },
    { icon: FirstAidKitIcon, label: 'Condition', value: wordsFor(CONDITIONS, draft.condition) },
    { icon: RulerIcon, label: 'Size', value: wordsFor(SIZES, draft.size) },
    { icon: PaintBoardIcon, label: 'Color', value: wordsFor(COLORS, colorOf(draft)) },
    { icon: MapPinIcon, label: 'Landmark', value: draft.landmark.trim() },
  ].filter((answer) => answer.value !== '');

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.five }]}>
        <View style={styles.intro}>
          {/* The same filled tick as a chosen answer on the form. */}
          <View style={[styles.mark, { backgroundColor: accent }]}>
            <HugeiconsIcon icon={Tick02Icon} size={28} color={accentForeground} strokeWidth={2} />
          </View>
          <ThemedText type="subtitle" role="heading">
            Report sent
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            Thank you for helping. We saved your photos and the spot you marked on the map.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText role="heading" style={styles.sectionTitle}>
            What you sent
          </ThemedText>
          {draft.photos.length > 0 && (
            <View
              role="group"
              aria-label={draft.photos.length === 1 ? '1 photo' : `${draft.photos.length} photos`}
              style={styles.photos}>
              {draft.photos.map((photo, index) => (
                <PhotoThumb
                  key={photo.uri}
                  uri={photo.uri}
                  label={`Photo ${index + 1}`}
                  style={styles.photo}
                />
              ))}
            </View>
          )}
          <ListGroup>
            {answers.map((answer, index) => (
              <Fragment key={answer.label}>
                {index > 0 && <Separator className="mx-4" />}
                {/* A row to read, not to press. */}
                <ListGroup.Item pointerEvents="none">
                  <ListGroup.ItemPrefix>
                    <HugeiconsIcon icon={answer.icon} size={18} color={muted} />
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemDescription>{answer.label}</ListGroup.ItemDescription>
                    <ListGroup.ItemTitle>{answer.value}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </View>

        <Button onPress={onDone}>Report another animal</Button>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the form.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  intro: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 18,
  },
  photos: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Three across at most. One or two photos keep that size and do not stretch.
  photo: {
    flex: 1,
    maxWidth: '32%',
    aspectRatio: 1,
    borderRadius: Spacing.two,
  },
});
