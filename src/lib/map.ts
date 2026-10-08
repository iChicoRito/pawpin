import type { StyleSpecification } from '@maplibre/maplibre-react-native';

// The stock "dark" style with every color lifted: dark grey ground, lighter streets, pale names.
// Made by scripts/make-dark-map-style.js. The stock style is close to black, with streets almost
// the same shade as the ground. The tiles, names, and icons still come from the free service.
import darkStyle from './map-dark.json';

// Free OpenStreetMap tiles. No key and no account.
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** The map follows the app's light or dark setting. A link in light mode, a style kept in the app in dark. */
export function mapStyleFor(isDark: boolean): string | StyleSpecification {
  return isDark ? (darkStyle as StyleSpecification) : LIGHT_STYLE;
}

// Marks drawn on the map that must stand out from it: near black on the light map, white on the
// dark one, each edged with the other.
export function mapInkFor(isDark: boolean) {
  return isDark ? { ink: '#FFFFFF', edge: '#1F1F1F' } : { ink: '#1F1F1F', edge: '#FFFFFF' };
}

/** Close enough to tell one gate or corner from the next. */
export const STREET_ZOOM = 17;

/** The zoom at which a search of this many meters around the viewer fits on a phone screen. */
export function zoomForRadius(radiusM: number) {
  if (radiusM <= 1000) return 14;
  if (radiusM <= 5000) return 12;
  if (radiusM <= 10000) return 11;
  return 9.5;
}
