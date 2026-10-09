import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Static HTML and initial hydration use light; the client then reads its own scheme. */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
