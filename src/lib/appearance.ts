import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

export type Appearance = 'system' | 'light' | 'dark';

// The hint is the one line under each choice where it is picked.
export const APPEARANCES: readonly { value: Appearance; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follows your phone’s setting.' },
  { value: 'light', label: 'Light', hint: 'Bright. Best in daylight.' },
  { value: 'dark', label: 'Dark', hint: 'Dim. Easier on the eyes at night.' },
];

const APPEARANCE_KEY = 'pawpin.appearance';

// The choice lives here, outside any screen, so it can be applied before the first screen draws.
let current: Appearance = 'system';
const listeners = new Set<() => void>();

function apply(next: Appearance) {
  current = next;
  // Uniwind switches the HeroUI colors and also tells the phone-wide color scheme, which the
  // app's own colors and the map read through `useColorScheme`.
  Uniwind.setTheme(next);
  listeners.forEach((listener) => listener());
}

/** Applies the choice kept on this phone. Called once when the app starts. */
export async function loadAppearance() {
  const saved = await AsyncStorage.getItem(APPEARANCE_KEY).catch(() => null);
  if (saved === 'light' || saved === 'dark') apply(saved);
}

/** Switches now and keeps the choice on this phone. It is not part of the account. */
export function setAppearance(next: Appearance) {
  apply(next);
  AsyncStorage.setItem(APPEARANCE_KEY, next).catch((error) => {
    console.warn('Keeping the appearance choice failed:', error);
  });
}

/** The current choice: follow the phone, or always light, or always dark. */
export function useAppearance() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current
  );
}
