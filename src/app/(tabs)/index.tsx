import Gps01Icon from '@hugeicons/core-free-icons/Gps01Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useIsFocused } from 'expo-router';
import { Button, Spinner, useThemeColor } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationGate } from '@/components/location-gate';
import { RadiusChoice } from '@/components/radius-choice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { mapInkFor, mapStyleFor, zoomForRadius } from '@/lib/map';
import { RADIUS_CHOICES, URGENCY_COLORS } from '@/lib/nearby';
import { URGENCIES, type ReportUrgency } from '@/lib/reports';

// A pin's size steps up with its urgency, so the three are told apart without color too.
const PIN_RADIUS: Record<ReportUrgency, number> = {
  critical: 12,
  needs_help_soon: 10,
  just_sighted: 9,
};
// In the key every dot is one size, so the line reads evenly. On the map the pins still differ.
const LEGEND_DOT = 10;
const VIEWER_RADIUS = 6;
const PIN_EDGE = '#FFFFFF';
const MOVE_MS = 400;
const FAB_SIZE = 52;
// Roughly the chooser's height, so the compass sits just under it.
const CHOOSER_HEIGHT = 48;
// The key's line along the bottom: how far up it sits, and its height. The location button sits
// above it, which also keeps it clear of the development gear button in the corner.
const LEGEND_BOTTOM = 28;
const LEGEND_HEIGHT = 32;

const LOCATION_FAILED =
  'Could not find your location. Check that location is on, or move near a window, then try again.';
const NETWORK_FAILED = 'Could not load reports. Check your connection and try again.';

// Phones only. Browsers get index.web.tsx.
export default function MapScreen() {
  return (
    <LocationGate title="Map">
      <NearbyMap />
    </LocationGate>
  );
}

function NearbyMap() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { reports, place, radiusM, status, failure, refresh } = useNearbyReports();
  const [surface, border, foreground] = useThemeColor(['surface', 'border', 'foreground']);
  const isDark = useColorScheme() === 'dark';
  // The viewer's dot. Not the usual blue: blue is the "just sighted" pin.
  const viewer = mapInkFor(isDark);
  const camera = useRef<CameraRef>(null);
  // Set by the Refresh button, so the map comes back to the viewer once the new place is read.
  const shouldRecenter = useRef(false);
  const [mapFailed, setMapFailed] = useState(false);

  // Tabs stay mounted, so this runs each time the Map comes back into view, not only once.
  useEffect(() => {
    if (isFocused) refresh();
    // `refresh` is a new function on every render; only coming into view should search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  // A new distance shows the whole of the new search area.
  useEffect(() => {
    if (!place) return;
    camera.current?.easeTo({
      center: [place.longitude, place.latitude],
      zoom: zoomForRadius(radiusM),
      duration: MOVE_MS,
    });
    // Not on every new place: the search that runs when the tab comes into view must not pull
    // the map away from where the viewer is looking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusM]);

  useEffect(() => {
    if (!place || !shouldRecenter.current) return;
    shouldRecenter.current = false;
    camera.current?.easeTo({
      center: [place.longitude, place.latitude],
      zoom: zoomForRadius(radiusM),
      duration: MOVE_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  const isLoading = status === 'loading';
  const radius = RADIUS_CHOICES.find((choice) => choice.value === radiusM)?.label ?? '';
  const message = failure === 'location' ? LOCATION_FAILED : NETWORK_FAILED;
  const panel = { backgroundColor: surface, borderColor: border };

  // Nothing to center the map on yet.
  if (!place) {
    return (
      <ThemedView style={[styles.container, styles.waiting]}>
        {failure && !isLoading ? (
          <>
            <ThemedText role="alert" style={styles.centered}>
              {message}
            </ThemedText>
            <Button variant="secondary" onPress={refresh}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <Spinner />
            <ThemedText type="small" themeColor="textSecondary" aria-live="polite">
              Finding your location…
            </ThemedText>
          </>
        )}
      </ThemedView>
    );
  }

  if (mapFailed) {
    return (
      <ThemedView role="alert" style={[styles.container, styles.waiting]}>
        <ThemedText style={styles.centered}>
          The map could not load. Open the List tab to see nearby strays.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <Map
        style={styles.container}
        mapStyle={mapStyleFor(isDark)}
        logo={false}
        touchPitch={false}
        // Two fingers turn the map. The map's own compass then shows under the chooser; tapping it
        // puts north back on top.
        compass
        compassPosition={{
          top: insets.top + Spacing.two + CHOOSER_HEIGHT + Spacing.two,
          right: Spacing.three,
        }}
        onDidFailLoadingMap={() => setMapFailed(true)}>
        {/* The map library takes longitude first. */}
        <Camera
          ref={camera}
          initialViewState={{
            center: [place.longitude, place.latitude],
            zoom: zoomForRadius(radiusM),
          }}
        />

        {/* All reports as one layer drawn by the map itself, not one view per report. */}
        <GeoJSONSource
          id="reports"
          data={{
            type: 'FeatureCollection',
            features: reports.map((report) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [report.longitude, report.latitude] },
              properties: { id: report.id, urgency: report.urgency },
            })),
          }}>
          <Layer
            type="circle"
            id="report-pins"
            source="reports"
            // The most urgent pin is drawn on top where pins overlap.
            layout={{
              'circle-sort-key': [
                'match',
                ['get', 'urgency'],
                'critical',
                3,
                'needs_help_soon',
                2,
                1,
              ],
            }}
            paint={{
              'circle-color': [
                'match',
                ['get', 'urgency'],
                'critical',
                URGENCY_COLORS.critical,
                'needs_help_soon',
                URGENCY_COLORS.needs_help_soon,
                URGENCY_COLORS.just_sighted,
              ],
              'circle-radius': [
                'match',
                ['get', 'urgency'],
                'critical',
                PIN_RADIUS.critical,
                'needs_help_soon',
                PIN_RADIUS.needs_help_soon,
                PIN_RADIUS.just_sighted,
              ],
              // The white edge keeps a pin apart from any street color under it.
              'circle-stroke-width': 2,
              'circle-stroke-color': PIN_EDGE,
            }}
          />
        </GeoJSONSource>

        {/* Where the viewer was at the last search. It does not follow them; Refresh moves it. */}
        <GeoJSONSource
          id="viewer"
          data={{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] },
            properties: {},
          }}>
          <Layer
            type="circle"
            id="viewer-ring"
            source="viewer"
            paint={{
              'circle-color': viewer.ink,
              'circle-opacity': isDark ? 0.25 : 0.15,
              'circle-radius': VIEWER_RADIUS * 3,
            }}
          />
          <Layer
            type="circle"
            id="viewer-dot"
            source="viewer"
            paint={{
              'circle-color': viewer.ink,
              'circle-radius': VIEWER_RADIUS,
              'circle-stroke-width': 3,
              'circle-stroke-color': viewer.edge,
            }}
          />
        </GeoJSONSource>

      </Map>

      {/* Laid out like a maps app: the choice across the top, the location button bottom right,
          the key bottom left. Touches between them still reach the map. */}
      <View pointerEvents="box-none" style={[styles.top, { top: insets.top + Spacing.two }]}>
        {/* The tabs as they come, with their own fill. No card behind them. */}
        <RadiusChoice />

        {failure && !isLoading ? (
          <View role="alert" style={[styles.panel, styles.notice, panel]}>
            <ThemedText type="small">{message}</ThemedText>
            <Button variant="secondary" onPress={refresh}>
              Try again
            </Button>
          </View>
        ) : (
          status === 'ready' &&
          reports.length === 0 && (
            <View style={[styles.panel, styles.notice, panel]}>
              <ThemedText type="small" aria-live="polite">
                No strays reported within {radius}.
              </ThemedText>
            </View>
          )
        )}
      </View>

      {/* One line along the bottom, like the strip a maps app keeps there. Three colors, three
          words; the viewer's own dot needs no label. */}
      <View pointerEvents="none" style={styles.legendBar}>
        <View
          role="group"
          aria-label="What the pin colors mean"
          // No shadow here: a quiet outline, so the key stays in the background of the map.
          style={[styles.legend, panel]}>
          {URGENCIES.map((urgency, index) => (
            <View key={urgency.value} style={styles.legendItem}>
              {/* A thin line between one meaning and the next. */}
              {index > 0 && <View style={[styles.legendRule, { backgroundColor: border }]} />}
              <View style={[styles.legendDot, { backgroundColor: URGENCY_COLORS[urgency.value] }]} />
              <ThemedText style={styles.legendLabel}>{urgency.label}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        role="button"
        aria-label="Go to my location and refresh"
        aria-busy={isLoading}
        disabled={isLoading}
        onPress={() => {
          shouldRecenter.current = true;
          refresh();
        }}
        style={({ pressed }) => [
          styles.panel,
          styles.fab,
          panel,
          pressed && styles.pressed,
        ]}>
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <HugeiconsIcon icon={Gps01Icon} size={24} color={foreground} />
        )}
      </Pressable>

      <Text style={styles.credit}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  waiting: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
    maxWidth: 320,
  },
  // Same column as the other tabs, with a narrower gutter so the map shows on both sides.
  top: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
  },
  // A solid surface with a soft shadow under it, so a control reads as lying on top of the map.
  panel: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  notice: {
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  // A pill along the bottom, above the map credit. Wraps to a second line on a very narrow phone
  // instead of running off the screen.
  legendBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: LEGEND_BOTTOM,
    alignItems: 'center',
  },
  legend: {
    borderWidth: 1,
    minHeight: LEGEND_HEIGHT,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    // A row that may wrap packs its lines at the top unless told otherwise, which left the spare
    // height under the words.
    alignContent: 'center',
    columnGap: Spacing.two,
    rowGap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: LEGEND_HEIGHT / 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  // The same space on its left (the row's gap) as on its right.
  legendRule: {
    width: StyleSheet.hairlineWidth * 2,
    height: 12,
    marginRight: Spacing.half,
  },
  legendDot: {
    width: LEGEND_DOT,
    height: LEGEND_DOT,
    borderRadius: LEGEND_DOT / 2,
    borderWidth: 1.5,
    borderColor: PIN_EDGE,
  },
  legendLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  // Round, bottom right, where the thumb rests: the place a maps app keeps its location button.
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: LEGEND_BOTTOM + LEGEND_HEIGHT + Spacing.three,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  // A light strip on the light and the dark map alike. Bottom left, clear of the corner
  // the development button uses.
  credit: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderTopRightRadius: Spacing.two,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    color: '#1F1F1F',
    fontSize: 11,
    lineHeight: 16,
  },
});
