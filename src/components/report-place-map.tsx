import { Camera, GeoJSONSource, Images, Layer, Map } from '@maplibre/maplibre-react-native';
import { Skeleton, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { mapStyleFor, PAW_IMAGES, STREET_ZOOM } from '@/lib/map';
import type { ReportUrgency } from '@/lib/reports';

const MAP_HEIGHT = 168;

type ReportPlaceMapProps = {
  latitude: number;
  longitude: number;
  urgency: ReportUrgency;
};

/**
 * A still picture of the streets around a report, with its pin in the middle. For looking, not for
 * moving: touches pass through, so the page scrolls over it. Phones only; browsers get
 * report-place-map.web.tsx.
 */
export function ReportPlaceMap({ latitude, longitude, urgency }: ReportPlaceMapProps) {
  const border = useThemeColor('border');
  const isDark = useColorScheme() === 'dark';
  const [isReady, setIsReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Without the map the landmark and the accuracy line below still say where it is.
  if (failed) return null;

  return (
    <View
      pointerEvents="none"
      role="img"
      aria-label="Map of where the animal was reported"
      style={[styles.box, { borderColor: border }]}>
      <Map
        style={styles.fill}
        // Drawn as part of the page, not on a surface of its own, so a blur over the page (the
        // confirm dialog on the report page) reaches the map too. Slower, which a still map can afford.
        androidView="texture"
        mapStyle={mapStyleFor(isDark)}
        compass={false}
        logo={false}
        attribution={false}
        onDidFailLoadingMap={() => setFailed(true)}
        onDidFinishLoadingMap={() => setIsReady(true)}>
        <Images images={PAW_IMAGES} />
        {/* The map library takes longitude first. One step out from street level, for bearings. */}
        <Camera initialViewState={{ center: [longitude, latitude], zoom: STREET_ZOOM - 1 }} />
        <GeoJSONSource
          id="report-place"
          data={{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
            properties: {},
          }}>
          {/* The same paw as on the Map tab, in its urgency color. */}
          <Layer
            type="symbol"
            id="report-place-pin"
            source="report-place"
            layout={{
              'icon-image': `paw-${urgency}`,
              'icon-size': 0.36,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        </GeoJSONSource>
      </Map>
      {/* Covers the empty grey box until the streets are drawn. */}
      {!isReady && <Skeleton className="absolute inset-0" />}
      <Text style={styles.credit}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The border keeps a pale map from running into a white page.
  box: {
    height: MAP_HEIGHT,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  // A light strip on the light and the dark map alike.
  credit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderTopLeftRadius: Spacing.two,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    color: '#1F1F1F',
    fontSize: 11,
    lineHeight: 16,
  },
});
