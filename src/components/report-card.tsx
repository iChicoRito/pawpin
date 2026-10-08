import { Image } from 'expo-image';
import { Card, Chip, Skeleton } from 'heroui-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { formatAge, formatDistance } from '@/lib/format';
import type { NearbyReport } from '@/lib/nearby';
import { ANIMAL_TYPES, URGENCIES, type ReportUrgency } from '@/lib/reports';

const PHOTO_SIZE = 64;

// The word's color steps up with the urgency. The least urgent stays neutral, so a list of
// sightings does not shout.
const URGENCY_CHIP: Record<ReportUrgency, 'danger' | 'warning' | 'default'> = {
  critical: 'danger',
  needs_help_soon: 'warning',
  just_sighted: 'default',
};

type ReportCardProps = {
  report: NearbyReport;
  /** Opens the report. Without it the card is plain text, not a button that does nothing. */
  onPress?: () => void;
};

/** One nearby report in the List: what it is, how urgent, how far, and how long ago. */
export function ReportCard({ report, onPress }: ReportCardProps) {
  // A typed kind has no entry in the list and is shown as typed.
  const animal =
    ANIMAL_TYPES.find((type) => type.value === report.animalType)?.label ??
    (report.animalType || 'Animal');
  const urgency = URGENCIES.find((option) => option.value === report.urgency)?.label ?? '';
  const distance = formatDistance(report.distanceM);
  const age = formatAge(report.createdAt);
  const isResponding = report.status === 'responding';
  // People see their own reports in the list too. The mark tells them it is not someone else's.
  const { session } = useSession();
  const isMine = report.reporterId === session?.user.id;
  const spoken = [
    animal,
    urgency,
    isMine && 'your report',
    isResponding && 'someone is on the way',
    `${distance} away`,
    `reported ${age.toLowerCase()}`,
    report.landmark,
  ]
    .filter(Boolean)
    .join(', ');

  const body = (
    <Card variant="default" style={styles.card}>
      {report.photos[0] ? (
        <Image source={{ uri: report.photos[0] }} style={styles.photo} />
      ) : (
        <ThemedView type="backgroundSelected" style={styles.photo} />
      )}

      <View style={styles.text}>
        {/* What it is on the left, how far on the right: the two things a rescuer scans for. */}
        <View style={styles.top}>
          <ThemedText style={styles.animal} numberOfLines={1}>
            {animal}
          </ThemedText>
          <ThemedText type="small" style={styles.distance}>
            {distance}
          </ThemedText>
        </View>

        <View style={styles.chips}>
          <Chip variant="secondary" size="sm" color={URGENCY_CHIP[report.urgency]}>
            {urgency}
          </Chip>
          {isMine && (
            <Chip variant="secondary" size="sm" color="accent">
              Your report
            </Chip>
          )}
          {isResponding && (
            <Chip variant="secondary" size="sm" color="success">
              On the way
            </Chip>
          )}
        </View>

        {/* The landmark gives way and is cut short; the age keeps its full width on the right. */}
        <View style={styles.bottom}>
          {report.landmark && (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
              style={styles.landmark}>
              {report.landmark}
            </ThemedText>
          )}
          <ThemedText themeColor="textSecondary" numberOfLines={1} style={styles.age}>
            {age}
          </ThemedText>
        </View>
      </View>
    </Card>
  );

  if (!onPress) {
    return (
      <View accessible aria-label={spoken}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      role="button"
      aria-label={spoken}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

/** The shape of a card while the first search runs: photo, name and distance, chip and age. */
export function ReportCardSkeleton() {
  return (
    <Card variant="default" style={styles.card}>
      <Skeleton className="h-16 w-16 rounded-2xl" />
      <View style={[styles.text, styles.skeletonText]}>
        <View style={styles.skeletonRow}>
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-12 rounded-md" />
        </View>
        <View style={styles.skeletonRow}>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Surface and corner come from HeroUI Card, as on the report form. Laid out as a row with less
  // padding: a list is scanned, so more reports on one screen matters more than air around each.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    paddingRight: Spacing.three,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    // The card's corner less the padding around the photo, so the two curves run side by side.
    borderRadius: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.one,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  // Takes the room that is left and cuts short, so a long typed animal never pushes the distance out.
  animal: {
    flex: 1,
    fontWeight: 600,
  },
  // Digits of equal width, so distances line up down the list.
  distance: {
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    overflow: 'hidden',
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  landmark: {
    flex: 1,
    fontWeight: 400,
  },
  // The smallest text on the card: it is read last. Pushed to the right edge, under the distance,
  // also when there is no landmark beside it.
  age: {
    marginLeft: 'auto',
    fontSize: 12,
    lineHeight: 16,
  },
  skeletonText: {
    gap: Spacing.two,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.7,
  },
});
