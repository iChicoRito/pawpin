import FilterHorizontalIcon from '@hugeicons/core-free-icons/FilterHorizontalIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { BottomSheet, Button, Slider, Tabs, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { RADIUS_CHOICES } from '@/lib/nearby';

/** Whose reports the List shows. */
export type ReportOwner = 'all' | 'mine' | 'others';

export const REPORT_OWNERS: { value: ReportOwner; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'others', label: 'Others' },
];

type ListFilterProps = {
  owner: ReportOwner;
  onOwnerChange: (owner: ReportOwner) => void;
};

/**
 * The List's filter: a button, and the drawer it opens. Whose reports to show is the List's own
 * choice. The distance is the one shared with the Map, so changing it here changes it there.
 */
export function ListFilter({ owner, onOwnerChange }: ListFilterProps) {
  const { radiusM, setRadius } = useNearbyReports();
  // The icon takes the color of the word beside it. A secondary button's label is a blend of two
  // colors, which `useThemeColor` cannot work out; reading it through its class can. The plain
  // accent stands in if that ever comes back empty.
  const accent = useThemeColor('accent');
  const label = useResolveClassNames('text-accent-soft-foreground').color;
  const iconColor = typeof label === 'string' ? label : accent;
  const [isOpen, setIsOpen] = useState(false);

  // The slider moves over the same four distances as the Map's chooser, by their place in the list.
  const chosen = Math.max(
    0,
    RADIUS_CHOICES.findIndex((choice) => choice.value === radiusM)
  );
  // Where the thumb is while it is being dragged. The search runs once, when it is let go.
  const [dragged, setDragged] = useState<number | null>(null);
  const step = dragged ?? chosen;

  return (
    <>
      {/* Small beside the title; the touch area reaches past it to a full thumb's size. */}
      <Button variant="secondary" size="sm" hitSlop={8} onPress={() => setIsOpen(true)}>
        <HugeiconsIcon icon={FilterHorizontalIcon} size={16} color={iconColor} />
        <Button.Label>Filter</Button.Label>
      </Button>

      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View style={styles.content}>
              <BottomSheet.Title>Filter</BottomSheet.Title>

              <View style={styles.group}>
                <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
                  Reports from
                </ThemedText>
                <Tabs
                  aria-label="Whose reports to show"
                  value={owner}
                  onValueChange={(value) =>
                    onOwnerChange(REPORT_OWNERS.find((option) => option.value === value)?.value ?? 'all')
                  }>
                  <Tabs.List className="self-stretch">
                    <Tabs.Indicator />
                    {REPORT_OWNERS.map((option) => (
                      <Tabs.Trigger key={option.value} value={option.value} className="flex-1">
                        <Tabs.Label>{option.label}</Tabs.Label>
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                </Tabs>
              </View>

              <View style={styles.group}>
                <View style={styles.distanceHeading}>
                  <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
                    Distance
                  </ThemedText>
                  {/* Follows the thumb, so the number is read before the search runs. */}
                  <ThemedText style={styles.distanceValue}>
                    Within {RADIUS_CHOICES[step].label}
                  </ThemedText>
                </View>
                <Slider
                  aria-label="Search distance"
                  minValue={0}
                  maxValue={RADIUS_CHOICES.length - 1}
                  step={1}
                  value={step}
                  onChange={(value) => setDragged(Number(value))}
                  onChangeEnd={(value) => {
                    setDragged(null);
                    const next = RADIUS_CHOICES[Number(value)].value;
                    if (next !== radiusM) setRadius(next);
                  }}>
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>
                {/* The four stops, under the places the thumb snaps to. */}
                <View aria-hidden style={styles.stops}>
                  {RADIUS_CHOICES.map((choice) => (
                    <ThemedText key={choice.value} themeColor="textSecondary" style={styles.stop}>
                      {choice.label}
                    </ThemedText>
                  ))}
                </View>
              </View>

              <Button onPress={() => setIsOpen(false)}>Done</Button>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  // Groups sit further apart than a heading and its control.
  content: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  distanceHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  distanceValue: {
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  stops: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stop: {
    fontSize: 12,
    lineHeight: 16,
  },
});
