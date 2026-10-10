import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import darkStyle from './map-dark';

// Free OpenStreetMap tiles. No key and no account.
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** Both themes use Liberty's detail; dark mode recolors a bundled snapshot of that style. */
export function mapStyleFor(isDark: boolean): string | StyleSpecification {
  return isDark ? darkStyle : LIGHT_STYLE;
}

// Marks drawn on the map that must stand out from it: near black on the light map, white on the
// dark one, each edged with the other.
export function mapInkFor(isDark: boolean) {
  return isDark ? { ink: '#FFFFFF', edge: '#1F1F1F' } : { ink: '#1F1F1F', edge: '#FFFFFF' };
}

// A report's pin: a filled paw in its urgency color with a white edge, drawn 96 px square.
// The names are what the map's layers ask for; they end in the urgency as the database spells it.
export const PAW_IMAGES = {
  'paw-critical': require('../../assets/images/pins/paw-critical.png'),
  'paw-needs_help_soon': require('../../assets/images/pins/paw-needs_help_soon.png'),
  'paw-just_sighted': require('../../assets/images/pins/paw-just_sighted.png'),
};

/** Close enough to tell one gate or corner from the next. */
export const STREET_ZOOM = 17;

/** The zoom at which a search of this many meters around the viewer fits on a phone screen. */
export function zoomForRadius(radiusM: number) {
  if (radiusM <= 1000) return 14;
  if (radiusM <= 5000) return 12;
  if (radiusM <= 10000) return 11;
  return 9.5;
}
