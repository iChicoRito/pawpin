import { Image } from 'expo-image';
import { BottomSheet, Button, Chip, useThemeColor } from 'heroui-native';
import { StyleSheet, Text, View } from 'react-native';

import { URGENCY_CHIP } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { formatAge, formatDistance } from '@/lib/format';
import type { NearbyReport } from '@/lib/nearby';
import { ANIMAL_TYPES, COLORS, CONDITIONS, labelFor, SIZES, URGENCIES } from '@/lib/reports';

const PHOTO_HEIGHT = 176;

type ReportPreviewProps = {
  /** The report of the pin that was tapped. Kept while the drawer slides away. */
  report: NearbyReport | undefined;
  isOpen: boolean;
  onClose: () => void;
  onView: (report: NearbyReport) => void;
};

/**
 * A drawer from the bottom of the Map with the gist of one report: enough to decide whether to open
 * it. Dragging it down, or tapping the map behind it, closes it.
 */
export function ReportPreview({ report, isOpen, onClose, onView }: ReportPreviewProps) {
  const { session } = useSession();
  const border = useThemeColor('border');

  // Condition, size, and color on one quiet line. Only what the reporter gave.
  const traits = report
    ? [
        labelFor(CONDITIONS, report.condition),
        labelFor(SIZES, report.size),
        labelFor(COLORS, report.color),
      ].filter(Boolean)
    : [];

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          {report && (
            <View style={styles.content}>
              {/* 1. The animal itself, wide enough to recognise. */}
              {report.photos[0] && (
                <View>
                  <Image source={{ uri: report.photos[0] }} style={styles.photo} />
                  {report.photos.length > 1 && (
                    // White on a dark veil reads over any photo.
                    <Text style={styles.photoCount}>{report.photos.length} photos</Text>
                  )}
                </View>
              )}

              {/* 2. What it is and how far: the largest text. Then when, then how urgent. */}
              <View style={styles.heading}>
                <View style={styles.titleRow}>
                  <BottomSheet.Title style={styles.title} numberOfLines={1}>
                    {labelFor(ANIMAL_TYPES, report.animalType) || 'Animal'}
                  </BottomSheet.Title>
                  <ThemedText style={styles.distance}>{formatDistance(report.distanceM)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Reported {formatAge(report.createdAt).toLowerCase()}
                  {traits.length > 0 && ` · ${traits.join(', ')}`}
                </ThemedText>
                <View style={styles.chips}>
                  <Chip variant="secondary" size="sm" color={URGENCY_CHIP[report.urgency]}>
                    {labelFor(URGENCIES, report.urgency)}
                  </Chip>
                  {report.status === 'responding' && (
                    <Chip variant="secondary" size="sm" color="success">
                      On the way
                    </Chip>
                  )}
                  {report.reporterId === session?.user.id && (
                    <Chip variant="secondary" size="sm" color="accent">
                      Your report
                    </Chip>
                  )}
                </View>
              </View>

              {/* 3. Where, under its own small heading and a line, as on the report page. */}
              {(report.landmark || report.accuracyM != null) && (
                <View style={[styles.where, { borderTopColor: border }]}>
                  <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
                    Where
                  </ThemedText>
                  {report.landmark && (
                    <ThemedText numberOfLines={2} style={styles.landmark}>
                      {report.landmark}
                    </ThemedText>
                  )}
                  {report.accuracyM != null && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Location accurate to about {Math.round(report.accuracyM)} m.
                    </ThemedText>
                  )}
                </View>
              )}

              {/* 4. The one action. */}
              <Button onPress={() => onView(report)}>View report</Button>
            </View>
          )}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
  photo: {
    width: '100%',
    height: PHOTO_HEIGHT,
    borderRadius: Spacing.three,
  },
  photoCount: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.two,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
  },
  heading: {
    gap: Spacing.half,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.three,
  },
  // The largest line in the drawer. Gives way to the distance, which is never cut.
  title: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  // Digits of equal width, as on the List.
  distance: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  where: {
    gap: Spacing.half,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  landmark: {
    fontWeight: 600,
  },
});
