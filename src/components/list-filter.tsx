import FilterHorizontalIcon from '@hugeicons/core-free-icons/FilterHorizontalIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { BottomSheet, Button, Slider, useBottomSheet, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DrawerBottomSheetOverlay } from '@/components/drawer-backdrop';
import { Spacing } from '@/constants/theme';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { RADIUS_CHOICES } from '@/lib/nearby';

/** Distance is shared with the Map, so changing it here changes it there. */
export function ListFilter() {
  const { radiusM, setRadius } = useNearbyReports();
  // Match the icon to the tertiary button's foreground label.
  const iconColor = useThemeColor('default-foreground');

  // The slider moves over the same four distances as the Map's chooser, by their place in the list.
  const chosen = Math.max(
    0,
    RADIUS_CHOICES.findIndex((choice) => choice.value === radiusM)
  );
  // Where the thumb is while it is being dragged. The search runs once, when it is let go.
  const [dragged, setDragged] = useState<number | null>(null);
  const step = dragged ?? chosen;

  return (
    <BottomSheet>
      {/* Small beside the title; the touch area reaches past it to a full thumb's size. */}
      <BottomSheet.Trigger asChild>
        <Button variant="tertiary" size="sm" hitSlop={8} style={styles.button}>
          <HugeiconsIcon icon={FilterHorizontalIcon} size={16} color={iconColor} />
          <Button.Label>Filter</Button.Label>
        </Button>
      </BottomSheet.Trigger>

      <BottomSheet.Portal>
        <DrawerBottomSheetOverlay />
        <BottomSheet.Content>
          <View style={styles.content}>
            <BottomSheet.Title>Filter</BottomSheet.Title>

            <View style={styles.group}>
              <View style={styles.distanceHeading}>
                <ThemedText type="small" role="heading" themeColor="textSecondary">
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

            <FilterDone />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function FilterDone() {
  const { onOpenChange } = useBottomSheet();
  return <Button onPress={() => onOpenChange(false)}>Done</Button>;
}

const styles = StyleSheet.create({
  // Keeps its own width at the end of the row it is put in, whatever is beside it.
  button: {
    flexShrink: 0,
    alignSelf: 'center',
  },
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
