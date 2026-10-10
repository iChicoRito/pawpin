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

/** One fade of the "on the way" dot, out or back. */
const PULSE_MS = 900;

// Shared with the map preview, so urgency keeps the same meaning on both surfaces.
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

const URGENCY_BACKGROUND_COLOR: Record<ReportUrgency, string> = {
  critical: 'bg-danger-soft',
  needs_help_soon: 'bg-warning-soft',
  just_sighted: 'bg-default-soft',
};

type ReportRowProps = {
  report: NearbyReport;
  onOpen: (report: NearbyReport) => void;
};

/** One report card, rendered independently by the virtualized list. */
export function ReportRow({ report, onOpen }: ReportRowProps) {
  const { session } = useSession();
  const foreground = useThemeColor('foreground');
  const urgencyColor = useResolveClassNames(URGENCY_TEXT_COLOR[report.urgency]).color;
  const urgencyBackground = useResolveClassNames(
    URGENCY_BACKGROUND_COLOR[report.urgency]
  ).backgroundColor;

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
    <Card className="bg-[#F0F0F3] dark:bg-[#222222]" style={styles.card}>
      {/* The whole card is one button, the bar at its foot included. */}
      <Pressable
        role="button"
        aria-label={spoken}
        onPress={() => onOpen(report)}
        style={styles.press}>
        <View style={styles.content}>
          {report.photos[0] ? (
            <Image source={{ uri: report.photos[0] }} contentFit="cover" style={styles.photo} />
          ) : (
            <ThemedView
              type="backgroundSelected"
              darkColor="#555555"
              style={[styles.photo, styles.noPhoto]}>
              <ThemedText type="small" style={[styles.noPhotoLabel, { color: foreground }]}>
                No photo
              </ThemedText>
            </ThemedView>
          )}
          <View style={styles.details}>
            <View style={styles.row}>
              <ThemedText numberOfLines={2} style={[styles.animal, { color: foreground }]}>
                {animal}
              </ThemedText>
              <View style={[styles.urgencyChip, { backgroundColor: urgencyBackground }]}>
                <ThemedText type="small" style={[styles.urgency, { color: urgencyColor }]}>
                  {urgency}
                </ThemedText>
              </View>
            </View>
            <ThemedText themeColor="textSecondary" style={styles.metadata}>
              {`${distance} away • ${age.toLowerCase()}`}
            </ThemedText>
          </View>
        </View>
        {isResponding && (
          <ThemedView
            testID="responding-footer"
            type="backgroundSelected"
            darkColor="#333333"
            style={styles.footer}>
            <LiveDot />
            <ThemedText style={styles.footerLabel}>
              {responding}
            </ThemedText>
          </ThemedView>
        )}
      </Pressable>
    </Card>
  );
}

/**
 * A green light that fades and comes back: a rescuer is going right now. Only its opacity changes,
 * so nothing around it moves. Still for people who turned motion off on their phone. The words
 * beside it say the same thing, so the meaning does not rest on the color or the movement.
 */
export function LiveDot() {
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

/** Match the thumbnail and two-line details of a compact report card. */
export function ReportListSkeleton({ rows }: { rows: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: rows }, (_, row) => (
        <Card key={row} className="bg-[#F0F0F3] dark:bg-[#222222]" style={styles.card}>
          <View pointerEvents="none" style={styles.press}>
            <View style={styles.content}>
              <Skeleton style={styles.photo} />
              <View style={styles.details}>
                <View style={styles.row}>
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </View>
                <Skeleton className="h-3 w-4/5 rounded-md" />
              </View>
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
    borderWidth: 0,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // The card's padding, kept by the button so every part of the card is pressed.
  press: {
    padding: Spacing.two,
    gap: Spacing.two,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  animal: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  metadata: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 400,
    fontVariant: ['tabular-nums'],
  },
  skeletonList: {
    gap: Spacing.two,
  },
  photo: {
    width: 66,
    height: 66,
    borderRadius: 24,
    flexShrink: 0,
  },
  noPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  urgency: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 400,
  },
  urgencyChip: {
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  // As wide as the card and as tall as a small button, its words in the middle.
  footer: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 32,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  // Full strength, not greyed: it is news, not a control that is switched off.
  footerLabel: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: 500,
    textAlign: 'center',
  },
  live: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
