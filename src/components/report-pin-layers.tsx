import { Layer } from '@maplibre/maplibre-react-native';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { URGENCY_COLORS } from '@/lib/nearby';

const SHAKE_ANGLES = [0, -10, 10, -7, 7, 0];
const SHAKE_STEP_MS = 120;
const SHAKE_REST_MS = 3500;
const CRITICAL_FILTER: ['==', ['get', string], string] = ['==', ['get', 'urgency'], 'critical'];

/** One native layer for every paw, so shaking never creates a React view per report. */
export function ReportPinLayers({ source, animate = true }: { source: string; animate?: boolean }) {
  const focused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [angle, setAngle] = useState(0);
  const moving = animate && focused && active && !reducedMotion;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!moving) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      step = (step + 1) % SHAKE_ANGLES.length;
      setAngle(SHAKE_ANGLES[step]);
      // A brief nudge draws attention to reports; the long rest keeps streets readable.
      timer = setTimeout(next, step === SHAKE_ANGLES.length - 1 ? SHAKE_REST_MS : SHAKE_STEP_MS);
    };
    timer = setTimeout(next, SHAKE_STEP_MS);
    return () => clearTimeout(timer);
  }, [moving]);

  return (
    <>
      <Layer
        type="symbol"
        id={`${source}-pins`}
        source={source}
        layout={{
          'icon-image': ['concat', 'paw-', ['get', 'urgency']],
          'icon-size': ['match', ['get', 'urgency'], 'critical', 0.36, 'needs_help_soon', 0.31, 0.28],
          'icon-rotate': moving ? angle : 0,
          'icon-rotation-alignment': 'viewport',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['match', ['get', 'urgency'], 'critical', 3, 'needs_help_soon', 2, 1],
        }}
      />
      <Layer
        type="circle"
        id={`${source}-critical-badge`}
        source={source}
        filter={[...CRITICAL_FILTER]}
        paint={{
          'circle-color': URGENCY_COLORS.critical,
          'circle-radius': 8,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-translate': [13, -13],
          'circle-translate-anchor': 'viewport',
        }}
      />
      <Layer
        type="symbol"
        id={`${source}-critical-warning`}
        source={source}
        filter={[...CRITICAL_FILTER]}
        layout={{
          'text-field': '!',
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-rotation-alignment': 'viewport',
        }}
        paint={{ 'text-color': '#FFFFFF', 'text-translate': [13, -13], 'text-translate-anchor': 'viewport' }}
      />
    </>
  );
}
