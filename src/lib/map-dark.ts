import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import liberty from './map-liberty.json';

// Liberty's complete layer set keeps landmarks and extruded buildings identical to light mode.
const base = liberty as StyleSpecification;
const ground = '#202124';
const water = '#172F46';
const park = '#263C33';
const building = '#41454C';

function surfaceColor(id: string) {
  if (id.startsWith('water')) return water;
  if (/park|wood|grass|pitch|track|cemetery|wetland/.test(id)) return park;
  if (id.startsWith('building')) return building;
  if (/hospital/.test(id)) return '#3D3039';
  if (/school|sand/.test(id)) return '#39362E';
  if (/ice/.test(id)) return '#39444D';
  return '#292C30';
}

function lineColor(id: string) {
  if (id.startsWith('water')) return water;
  if (/park/.test(id)) return '#3D5848';
  if (/boundary/.test(id)) return '#7D8590';
  if (/rail/.test(id)) return '#858A93';
  if (/casing/.test(id)) return '#303238';
  if (/motorway|trunk|primary/.test(id)) return '#8C8064';
  if (/secondary|tertiary|link/.test(id)) return '#70757D';
  if (/path|pedestrian/.test(id)) return '#8A9099';
  return '#50545B';
}

const darkStyle: StyleSpecification = {
  ...base,
  layers: base.layers.map((layer) => {
    const paint = { ...layer.paint } as Record<string, unknown>;
    if (layer.type === 'background') paint['background-color'] = ground;
    if (layer.type === 'raster') {
      // The low-zoom satellite underlay otherwise puts pale terrain over the dark ground.
      paint['raster-opacity'] = 0;
    }
    if (layer.type === 'fill') {
      if ('fill-color' in paint) paint['fill-color'] = surfaceColor(layer.id);
      if ('fill-outline-color' in paint) paint['fill-outline-color'] = '#555B64';
    }
    if (layer.type === 'fill-extrusion') paint['fill-extrusion-color'] = building;
    if (layer.type === 'line' && 'line-color' in paint) paint['line-color'] = lineColor(layer.id);
    if (layer.type === 'symbol' && layer.layout?.['text-field'] && !/shield/.test(layer.id)) {
      // A dark halo keeps labels readable over roads and roofs, not only over the ground.
      paint['text-color'] = layer.id.startsWith('water') ? '#9FC5E8'
        : layer.id.startsWith('poi') ? '#D0D9E8' : '#E8EAED';
      paint['text-halo-color'] = ground;
      paint['text-halo-width'] = 1.5;
      paint['text-halo-blur'] = 0.5;
    }
    // Sprite icons are colored bitmaps, not SDFs: icon-color would not brighten them.
    // Keep their original colored badges and the light road shields with dark shield text.
    return { ...layer, paint } as typeof layer;
  }),
};

export default darkStyle;
