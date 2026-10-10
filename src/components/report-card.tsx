import { Image } from 'expo-image';
import { Card, Skeleton, useThemeColor } from 'heroui-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

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

const URGENCY_TEXT_COLOR: Record<ReportUrgency, string> = {
  critical: 'text-danger-soft-foreground',
  needs_help_soon: 'text-warning-soft-foreground',
  just_sighted: 'text-default-soft-foreground',
};

type ReportRowProps = {
  report: NearbyReport;
  onOpen: (report: NearbyReport) => void;
};

/** One report card, rendered independently by the virtualized list. */
export function ReportRow({ report, onOpen }: ReportRowProps) {
  const { session } = useSession();
  const border = useThemeColor('border');
  const foreground = useThemeColor('foreground');
  const urgencyColor = useResolveClassNames(URGENCY_TEXT_COLOR[report.urgency]).color;

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
    <Card style={[styles.card, { borderColor: border }]}>
      <Pressable
        role="button"
        aria-label={spoken}
        onPress={() => onOpen(report)}
        style={styles.row}>
        {report.photos[0] ? (
          <Image source={{ uri: report.photos[0] }} style={styles.photo} />
        ) : (
          <ThemedView type="backgroundSelected" style={styles.photo} />
        )}
        <View style={styles.details}>
          <ThemedText numberOfLines={1} style={{ color: foreground }}>
            {animal}
          </ThemedText>
          <ThemedText type="small" style={[styles.urgency, { color: urgencyColor }]}>
            {urgency}
          </ThemedText>
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
        </View>
        <View style={styles.end}>
          <ThemedText type="small" style={styles.distance}>
            {distance}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.age}>
            {age}
          </ThemedText>
        </View>
      </Pressable>
    </Card>
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

/** The shape of the list while the first search runs: photo, name and urgency, distance and age. */
export function ReportListSkeleton({ rows }: { rows: number }) {
  const border = useThemeColor('border');
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: rows }, (_, row) => (
        <Card key={row} style={[styles.card, { borderColor: border }]}>
          <View pointerEvents="none" style={styles.row}>
            <Skeleton className="h-14 w-14 rounded-xl" />
            <View style={styles.details}>
              <View style={styles.skeletonText}>
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </View>
            </View>
            <View style={[styles.end, styles.skeletonText]}>
              <Skeleton className="h-4 w-12 rounded-md" />
              <Skeleton className="h-3 w-10 rounded-md" />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two + Spacing.one,
    gap: Spacing.two + Spacing.one,
  },
  details: {
    flex: 1,
  },
  skeletonList: {
    gap: Spacing.two,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.two + Spacing.one,
  },
  urgency: {
    fontSize: 12,
    lineHeight: 16,
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
