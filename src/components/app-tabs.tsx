import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { useThemeColor } from 'heroui-native';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';

export const BAR_HEIGHT = 64;
const ICON_SIZE = 20;
/** Width of the top line, as a share of one tab's width. */
const LINE_SHARE = 0.6;
const SWITCH_MS = 240;

const TAB_ICON_PATHS = {
  map: 'M3 6 8 3v15l-5 3V6Zm7-3 4 3v15l-4-3V3Zm6 3 5-3v15l-5 3V6Z',
  list: 'M4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm5 0h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm5 0h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM4 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm5 0h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z',
  camera: 'M9 3h6l2 3h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3Zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  user: 'M12 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM9 13h6a6 6 0 0 1 6 6v2H3v-2a6 6 0 0 1 6-6Z',
  dashboard: 'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm11 0h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm11 0h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z',
} as const;

type TabIcon = keyof typeof TAB_ICON_PATHS;

function FilledTabIcon({ icon, color }: { icon: TabIcon; color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" aria-hidden>
      <Path d={TAB_ICON_PATHS[icon]} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

type Tab = {
  name: string;
  href: '/' | '/list' | '/report' | '/profile';
  label: string;
  accessibilityLabel?: string;
  icon: TabIcon;
};

const TABS: readonly Tab[] = [
  { name: 'index', href: '/', label: 'Map', icon: 'map' },
  { name: 'list', href: '/list', label: 'List', icon: 'list' },
  {
    name: 'report',
    href: '/report',
    label: 'Report',
    accessibilityLabel: 'Report a stray',
    icon: 'camera',
  },
  { name: 'profile', href: '/profile', label: 'Profile', icon: 'user' },
];

// An admin does not report or rescue. The first two routes are the same ones, and show the
// admin's own screens (see `(tabs)/index.tsx` and `(tabs)/list.tsx`).
const ADMIN_TABS: readonly Tab[] = [
  { name: 'index', href: '/', label: 'Dashboard', icon: 'dashboard' },
  { name: 'list', href: '/list', label: 'Reports', icon: 'list' },
  { name: 'profile', href: '/profile', label: 'Profile', icon: 'user' },
];

// A screen that needs the whole display (the report camera) hides the bar while it is in view.
let isBarHidden = false;
const barListeners = new Set<() => void>();

function setBarHidden(next: boolean) {
  isBarHidden = next;
  barListeners.forEach((listener) => listener());
}

function watchBar(listener: () => void) {
  barListeners.add(listener);
  return () => {
    barListeners.delete(listener);
  };
}

/** Hides the bottom tab bar for as long as `isHidden` is true and the calling screen is on screen. */
export function useHideTabBar(isHidden: boolean) {
  useEffect(() => {
    if (!isHidden) return;
    setBarHidden(true);
    return () => setBarHidden(false);
  }, [isHidden]);
}

export default function AppTabs() {
  const { isAdmin } = useSession();
  const tabs = isAdmin ? ADMIN_TABS : TABS;
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <TabBar tabs={tabs}>
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton
                label={tab.label}
                accessibilityLabel={tab.accessibilityLabel ?? tab.label}
                icon={tab.icon}
              />
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}

function TabBar({ tabs, style, children, ...props }: ViewProps & { tabs: readonly Tab[] }) {
  const insets = useSafeAreaInsets();
  const [surface, border, accent] = useThemeColor(['surface', 'border', 'accent']);
  const [rowWidth, setRowWidth] = useState(0);
  const isHidden = useSyncExternalStore(watchBar, () => isBarHidden);

  const pathname = usePathname();
  // Screens opened inside a tab (for example /report/form) keep that tab selected.
  const selected = Math.max(
    0,
    tabs.findIndex((tab) => tab.href !== '/' && pathname.startsWith(tab.href))
  );

  const tabWidth = rowWidth / tabs.length;
  const lineWidth = tabWidth * LINE_SHARE;
  const position = useDerivedValue(
    () => withTiming(selected, { duration: SWITCH_MS }),
    [selected]
  );
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * tabWidth + (tabWidth - lineWidth) / 2 }],
  }));

  return (
    <View
      {...props}
      style={[
        // TabList passes its own row layout in `style`; the bar's layout must win.
        style,
        styles.bar,
        { backgroundColor: surface, borderTopColor: border, paddingBottom: insets.bottom },
        // Hidden, not removed: the tab buttons inside must stay mounted for the tabs to work.
        isHidden && styles.hidden,
      ]}>
      <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {rowWidth > 0 && (
          <Animated.View
            style={[styles.line, { width: lineWidth, backgroundColor: accent }, lineStyle]}
          />
        )}
        {children}
      </View>
    </View>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  accessibilityLabel: string;
  icon: TabIcon;
};

function TabButton({ label, accessibilityLabel, icon, isFocused, ...props }: TabButtonProps) {
  const [accent, foreground, muted] = useThemeColor(['accent', 'foreground', 'muted']);
  const progress = useDerivedValue(
    () => withTiming(isFocused ? 1 : 0, { duration: SWITCH_MS }),
    [isFocused]
  );

  // Muted and accent copies cross-fade without changing the solid icon's shape.
  const restStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const activeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Pressable
      {...props}
      role="tab"
      aria-selected={!!isFocused}
      aria-label={accessibilityLabel}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Animated.View style={restStyle}>
          <FilledTabIcon icon={icon} color={muted} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, activeStyle]}>
          <FilledTabIcon icon={icon} color={accent} />
        </Animated.View>
      </View>
      <View aria-hidden>
        <Animated.Text style={[styles.label, { color: muted }, restStyle]}>{label}</Animated.Text>
        <Animated.View style={[StyleSheet.absoluteFill, activeStyle]}>
          {/* `accent` alone is 3.7:1 on a light bar, too low for small text. A 20% foreground copy on
              top deepens it to about 5:1. HeroUI's own token for this mix does not resolve outside CSS. */}
          <Text style={[styles.label, { color: accent }]}>{label}</Text>
          <Text style={[styles.label, styles.labelDeepen, { color: foreground }]}>{label}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  hidden: {
    display: 'none',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    height: BAR_HEIGHT,
  },
  line: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: 600,
  },
  labelDeepen: {
    position: 'absolute',
    opacity: 0.2,
  },
});
