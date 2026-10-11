import Gps01Icon from '@hugeicons/core-free-icons/Gps01Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { Button, Skeleton, Spinner, useThemeColor } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminDashboard } from '@/components/admin-dashboard';
import { LocationGate } from '@/components/location-gate';
import { MapLegend } from '@/components/map-legend';
import { RadiusChoice } from '@/components/radius-choice';
import { ReportPreview } from '@/components/report-preview';
import { ReportPinLayers } from '@/components/report-pin-layers';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { useSession } from '@/hooks/use-session';
import { dismissAlertCard, isAlertCardDismissed, useAlertPermission } from '@/lib/alerts';
import { mapStyleFor, PAW_IMAGES, VIEWER_COLOR, zoomForRadius } from '@/lib/map';
import { RADIUS_CHOICES } from '@/lib/nearby';
import { playSound } from '@/lib/sounds';

const VIEWER_RADIUS = 6;
const MOVE_MS = 400;
const FAB_SIZE = 52;
// Roughly the chooser's height, so the compass sits just under it.
const CHOOSER_HEIGHT = 48;
// The key's line along the bottom: how far up it sits, and its height. The location button sits
// above it, which also keeps it clear of the development gear button in the corner.
const LEGEND_BOTTOM = 28;
const LEGEND_HEIGHT = 110;

const LOCATION_FAILED =
  'Could not find your location. Check that location is on, or move near a window, then try again.';
const NETWORK_FAILED = 'Could not load reports. Check your connection and try again.';

// Phones only. Browsers get index.web.tsx.
export default function MapScreen() {
  // An admin does not look for strays: the first tab is their Dashboard instead.
  const { isAdmin } = useSession();
  if (isAdmin) return <AdminDashboard />;
  return (
    <LocationGate title="Map">
      <NearbyMap />
    </LocationGate>
  );
}

function NearbyMap() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const router = useRouter();
  const { reports, place, radiusM, status, failure, refresh } = useNearbyReports();
  const [surface, border, foreground] = useThemeColor(['surface', 'border', 'foreground']);
  const isDark = useColorScheme() === 'dark';
  const [legendHeight, setLegendHeight] = useState(LEGEND_HEIGHT);
  const camera = useRef<CameraRef>(null);
  // Set by the Refresh button, so the map comes back to the viewer once the new place is read.
  const shouldRecenter = useRef(false);
  const [mapFailed, setMapFailed] = useState(false);
  // The pin that was tapped, and whether its drawer is up. Kept apart so the drawer still has
  // its report to show while it slides away.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const selected = reports.find((report) => report.id === selectedId);
  // The alerts card. Hidden until this phone's "Not now" is read, so it never flashes by.
  const [alertPermission] = useAlertPermission();
  const [isOfferDismissed, setIsOfferDismissed] = useState(true);
  useEffect(() => {
    isAlertCardDismissed().then(setIsOfferDismissed);
  }, []);
  const canOfferAlerts =
    !isOfferDismissed && !!alertPermission && !alertPermission.granted && alertPermission.canAskAgain;

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
    if (failure && !isLoading) {
      return (
        <ThemedView style={[styles.container, styles.waiting]}>
          <ThemedText role="alert" style={styles.centered}>
            {message}
          </ThemedText>
          <Button variant="secondary" onPress={refresh}>
            Try again
          </Button>
        </ThemedView>
      );
    }
    // The map's own outline while the phone finds itself: the map as a grey field, with the
    // chooser, the key, and the location button where they will be. Nothing jumps when it arrives.
    return (
      <ThemedView style={styles.container}>
        {/* Pulses in place. A shimmer sweeping a whole screen is a lot of movement. */}
        <Skeleton variant="pulse" className="absolute inset-0 rounded-none" />
        {/* In the very middle, on its own small surface so it reads over the grey. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.waiting]}>
          <View style={[styles.panel, styles.loading, panel]}>
            <Spinner size="sm" />
            <ThemedText type="small" aria-live="polite">
              Loading map…
            </ThemedText>
          </View>
        </View>
        <View pointerEvents="none" style={[styles.top, { top: insets.top + Spacing.two }]}>
          <View style={[styles.panel, styles.ghostChooser, panel]} />
        </View>
        <View pointerEvents="none" style={styles.legendBar}>
          <View style={[styles.legend, styles.ghostLegend, panel]} />
        </View>
        <View pointerEvents="none" style={[styles.panel, styles.fab, panel]} />
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
        onDidFailLoadingMap={() => {
          playSound('error');
          setMapFailed(true);
        }}>
        {/* The map library takes longitude first. */}
        <Camera
          ref={camera}
          initialViewState={{
            center: [place.longitude, place.latitude],
            zoom: zoomForRadius(radiusM),
          }}
        />

        {/* The paw pictures, handed to the map once so its layers can draw them. */}
        <Images images={PAW_IMAGES} />

        {/* All reports as one layer drawn by the map itself, not one view per report. */}
        <GeoJSONSource
          id="reports"
          // The library gives each pin a 44 px touch area. Where pins overlap, the one on top is
          // picked. A tap brings up a drawer with the summary; the full report is one more tap.
          onPress={(event) => {
            const id = event.nativeEvent.features[0]?.properties?.id;
            if (typeof id !== 'string') return;
            setSelectedId(id);
            setIsPreviewOpen(true);
          }}
          data={{
            type: 'FeatureCollection',
            features: reports.map((report) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [report.longitude, report.latitude] },
              properties: { id: report.id, urgency: report.urgency },
            })),
          }}>
          <ReportPinLayers source="reports" animate={reports.length > 0} />
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
              'circle-color': VIEWER_COLOR,
              'circle-opacity': isDark ? 0.25 : 0.15,
              'circle-radius': VIEWER_RADIUS * 3,
            }}
          />
          <Layer
            type="circle"
            id="viewer-dot"
            source="viewer"
            paint={{
              'circle-color': VIEWER_COLOR,
              'circle-radius': VIEWER_RADIUS,
              'circle-stroke-width': 3,
              'circle-stroke-color': '#FFFFFF',
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

        {/* Offered once, to someone the phone has not yet asked about notifications. The reason
            and the phone's own prompt are on the Alerts screen. */}
        {canOfferAlerts && (
          <View style={[styles.panel, styles.notice, panel]}>
            <ThemedText type="small">Get alerts for strays near you.</ThemedText>
            <View style={styles.offerChoices}>
              <Button size="sm" onPress={() => router.push('/alerts')}>
                Set up
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => {
                  setIsOfferDismissed(true);
                  dismissAlertCard();
                }}>
                Not now
              </Button>
            </View>
          </View>
        )}
      </View>

      {/* Legend height is measured, so the location button clears wrapped and larger text. */}
      <View pointerEvents="none" style={styles.legendBar}>
        <MapLegend onHeight={setLegendHeight} />
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
          { bottom: LEGEND_BOTTOM + legendHeight + Spacing.two },
          panel,
          pressed && styles.pressed,
        ]}>
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <HugeiconsIcon icon={Gps01Icon} size={24} color={foreground} />
        )}
      </Pressable>

      <ReportPreview
        report={selected}
        isOpen={isPreviewOpen && !!selected}
        onClose={() => setIsPreviewOpen(false)}
        onView={(report) => {
          // Closed first, so the drawer is not left hanging over the report page.
          setIsPreviewOpen(false);
          router.push({ pathname: '/report/[id]', params: { id: report.id } });
        }}
      />

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
  offerChoices: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Stand-ins for the chooser and the key while the map is not there yet. Same sizes as the real ones.
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  ghostChooser: {
    height: CHOOSER_HEIGHT,
  },
  ghostLegend: {
    width: '100%',
  },
  // Above the map credit and tabs; never covers the map's attribution.
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
    borderRadius: Spacing.three,
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
