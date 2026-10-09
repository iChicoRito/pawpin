import { Image } from 'expo-image';
import { Chip, ListGroup, Separator, Skeleton, useThemeColor } from 'heroui-native';
import { Fragment, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { formatAge, formatDistance } from '@/lib/format';
import type { NearbyReport } from '@/lib/nearby';
import { ANIMAL_TYPES, URGENCIES, type ReportUrgency } from '@/lib/reports';

const PHOTO_SIZE = 56;
/** One fade of the "on the way" dot, out or back. */
const PULSE_MS = 900;

// The word's color steps up with the urgency. The least urgent stays neutral, so a list of
// sightings does not shout.
export const URGENCY_CHIP: Record<ReportUrgency, 'danger' | 'warning' | 'default'> = {
  critical: 'danger',
  needs_help_soon: 'warning',
  just_sighted: 'default',
};

type ReportRowProps = {
  report: NearbyReport;
  onOpen: (report: NearbyReport) => void;
  isFirst: boolean;
  isLast: boolean;
};

/**
 * One virtualized row. Only the outer rows are rounded, preserving the grouped-list surface.
 */
export function ReportRow({ report, onOpen, isFirst, isLast }: ReportRowProps) {
  const { session } = useSession();

  // A typed kind has no entry in the list and is shown as typed.
  const animal =
    ANIMAL_TYPES.find((type) => type.value === report.animalType)?.label ??
    (report.animalType || 'Animal');
  const urgency = URGENCIES.find((option) => option.value === report.urgency)?.label ?? '';
  const distance = formatDistance(report.distanceM);
  const age = formatAge(report.createdAt);
  const isResponding = report.status === 'responding';
  const responding =
    report.rescuerId === session?.user.id ? 'You are on the way' : 'Someone is on the way';
  const spoken = [
    animal,
    urgency,
    isResponding && responding.toLowerCase(),
    `${distance} away`,
    `reported ${age.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <ListGroup
      className={`rounded-none shadow-none ${isFirst ? 'rounded-t-3xl' : ''} ${isLast ? 'rounded-b-3xl' : ''}`}>
      {!isFirst && <Separator className="mx-4" />}
      <ListGroup.Item role="button" aria-label={spoken} onPress={() => onOpen(report)}>
        <ListGroup.ItemPrefix>
          {report.photos[0] ? (
            <Image source={{ uri: report.photos[0] }} style={styles.photo} />
          ) : (
            <ThemedView type="backgroundSelected" style={styles.photo} />
          )}
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>{animal}</ListGroup.ItemTitle>
          <View style={styles.chips}>
            <Chip variant="secondary" size="sm" color={URGENCY_CHIP[report.urgency]}>
              {urgency}
            </Chip>
          </View>
          {isResponding && (
            <View style={styles.responding}>
              <LiveDot />
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.regular}>
                {responding}
              </ThemedText>
            </View>
          )}
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <View style={styles.end}>
            <ThemedText type="small" style={styles.distance}>
              {distance}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.age}>
              {age}
            </ThemedText>
          </View>
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </ListGroup>
  );
}

/**
 * A green light that fades and comes back: a rescuer is going right now. Only its opacity changes,
 * so nothing around it moves. Still for people who turned motion off on their phone. The words
 * beside it say the same thing, so the meaning does not rest on the color or the movement.
 */
function LiveDot() {
  const success = useThemeColor('success');
  const prefersStill = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (prefersStill) return;
    opacity.value = withRepeat(
      withTiming(0.35, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(opacity);
      opacity.value = 1;
    };
  }, [prefersStill, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.live, { backgroundColor: success }, pulse]} />;
}

/** The shape of the list while the first search runs: photo, name and chip, distance and age. */
export function ReportListSkeleton({ rows }: { rows: number }) {
  return (
    <ListGroup>
      {Array.from({ length: rows }, (_, row) => (
        <Fragment key={row}>
          {row > 0 && <Separator className="mx-4" />}
          <ListGroup.Item pointerEvents="none">
            <ListGroup.ItemPrefix>
              <Skeleton className="h-14 w-14 rounded-xl" />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <View style={styles.skeletonText}>
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </View>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix>
              <View style={[styles.end, styles.skeletonText]}>
                <Skeleton className="h-4 w-12 rounded-md" />
                <Skeleton className="h-3 w-10 rounded-md" />
              </View>
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
        </Fragment>
      ))}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.two + Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  responding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    marginTop: Spacing.one,
  },
  regular: {
    fontWeight: 400,
  },
  live: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Right-aligned column at the end of the row.
  end: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  distance: {
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  // The smallest text on the row: it is read last.
  age: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  skeletonText: {
    gap: Spacing.two,
  },
});
