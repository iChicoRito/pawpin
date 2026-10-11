import { Image } from 'expo-image';
import { useThemeColor } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { PAW_IMAGES, VIEWER_COLOR } from '@/lib/map';
import { URGENCIES } from '@/lib/reports';

export function MapLegend({ onHeight }: { onHeight: (height: number) => void }) {
  const [surface, border] = useThemeColor(['surface', 'border']);
  return (
    <View
      role="group"
      aria-label="Map key"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={[styles.legend, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.heading}>
        <ThemedText type="smallBold">Pin urgency</ThemedText>
        <View accessible aria-label="You, red location dot" style={styles.viewer}>
          <View aria-hidden style={styles.viewerDot} />
          <ThemedText type="small">You</ThemedText>
        </View>
      </View>
      <View style={styles.items}>
        {URGENCIES.map((urgency) => (
          <View
            key={urgency.value}
            accessible
            aria-label={`${urgency.label}. ${urgency.hint}`}
            style={styles.item}>
            <View aria-hidden style={styles.mark}>
              <Image source={PAW_IMAGES[`paw-${urgency.value}`]} style={styles.paw} />
              {urgency.value === 'critical' && (
                <ThemedText style={styles.warning}>!</ThemedText>
              )}
            </View>
            <ThemedText type="small" style={styles.label}>{urgency.label}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Solid themed surface keeps labels readable over either map, with no decorative elevation.
  legend: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    padding: Spacing.two + Spacing.one,
    gap: Spacing.two,
  },
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  viewer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  viewerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: VIEWER_COLOR },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  item: { flex: 1, minWidth: 84, alignItems: 'center', gap: Spacing.one },
  mark: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
  paw: { width: 24, height: 24 },
  warning: {
    position: 'absolute', right: 0, top: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#C62828', color: '#FFFFFF',
    textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: 700,
  },
  label: { textAlign: 'center', flexShrink: 1, fontWeight: 500 },
});
