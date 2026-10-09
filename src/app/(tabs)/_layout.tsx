import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from 'heroui-native';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppTabs, { BAR_HEIGHT } from '@/components/app-tabs';
import { Spacing } from '@/constants/theme';
import { useAlertTaps } from '@/lib/alerts';

export default function TabLayout() {
  // Here, not in the root layout: the tabs exist only for a signed-in user, with the screens ready
  // to be opened.
  useAlertTaps();

  return (
    <>
      <AppTabs />
      {/* Developer shortcut: present while developing, absent from release builds. */}
      {__DEV__ && <ComponentsButton />}
    </>
  );
}

const BUTTON_SIZE = 36;

/** Small floating gear that opens the HeroUI components page. The page's only entry point. */
function ComponentsButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [surface, border, muted] = useThemeColor(['surface', 'border', 'muted']);

  return (
    <Pressable
      role="button"
      aria-label="Open components page"
      // Small to look at, but the touch area still reaches 44 px.
      hitSlop={(44 - BUTTON_SIZE) / 2}
      onPress={() => router.push('/components')}
      style={({ pressed }) => [
        styles.button,
        {
          bottom: BAR_HEIGHT + insets.bottom + Spacing.three,
          backgroundColor: surface,
          borderColor: border,
        },
        pressed && styles.pressed,
      ]}>
      <HugeiconsIcon icon={Settings02Icon} size={18} color={muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: Spacing.three,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
