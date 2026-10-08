// Makes the app's dark map style: OpenFreeMap's "dark" style with every color lifted, so the
// ground is dark grey instead of near black and streets and names stand out from it.
// Run again only to change the colors:
//   curl -s https://tiles.openfreemap.org/styles/dark -o dark.json
//   node scripts/make-dark-map-style.js dark.json src/lib/map-dark.json
const fs = require('fs');
const [input, output] = process.argv.slice(2);
const style = JSON.parse(fs.readFileSync(input, 'utf8'));

const HUE = 222; // a cool grey, to sit with the app's dark surfaces
const MIN_SATURATION = 0.08;
const WATER = 'hsla(215, 28%, 16%, 1)';

function toHsla(text) {
  const t = text.trim();
  let m = t.match(/^hsla?\(([^)]+)\)$/i);
  if (m) {
    const [h, s, l, a = '1'] = m[1].split(',').map((part) => part.trim());
    return [parseFloat(h), parseFloat(s) / 100, parseFloat(l) / 100, parseFloat(a)];
  }
  let r, g, b, a = 1;
  m = t.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map((part) => parseFloat(part.trim()));
    [r, g, b] = parts;
    if (parts.length > 3) a = parts[3];
  } else if (/^#[0-9a-f]{3}$/i.test(t)) {
    [r, g, b] = [1, 2, 3].map((i) => parseInt(t[i] + t[i], 16));
  } else if (/^#[0-9a-f]{6}$/i.test(t)) {
    [r, g, b] = [1, 3, 5].map((i) => parseInt(t.slice(i, i + 2), 16));
  } else {
    return null;
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l, a];
}

function lift(text) {
  const parsed = toHsla(text);
  if (!parsed) return text;
  let [h, s, l, a] = parsed;
  l = Math.min(0.92, 0.15 + 1.45 * l);
  if (s < 0.05) { h = HUE; s = MIN_SATURATION; }
  return `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;
}

function walk(value) {
  if (typeof value === 'string') return /^(#|rgb|hsl)/i.test(value.trim()) ? lift(value) : value;
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]));
  }
  return value;
}

let changed = 0;
for (const layer of style.layers) {
  if (!layer.paint) continue;
  const before = JSON.stringify(layer.paint);
  layer.paint = walk(layer.paint);
  // Water reads as water when it is darker and bluer than the land, not a lighter grey.
  if (layer.type === 'fill' && layer.id.startsWith('water')) layer.paint['fill-color'] = WATER;
  if (JSON.stringify(layer.paint) !== before) changed++;
}
fs.writeFileSync(output, JSON.stringify(style));
const show = (id) => {
  const layer = style.layers.find((l) => l.id === id || l.id.startsWith(id));
  return layer ? JSON.stringify(layer.paint[`${layer.type}-color`] ?? layer.paint['text-color']) : '-';
};
console.log(`layers recolored: ${changed} of ${style.layers.length}`);
for (const id of ['background', 'water', 'building', 'highway_minor', 'highway_major', 'place', 'highway_name']) {
  console.log(' ', id.padEnd(16), show(id));
}
