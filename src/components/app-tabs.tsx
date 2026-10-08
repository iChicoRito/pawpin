// One file per icon. The package's main entry loads all 12,000 icon files at once, which crashes Metro.
import Camera01Icon from '@hugeicons/core-free-icons/Camera01Icon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import MapsIcon from '@hugeicons/core-free-icons/MapsIcon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
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

import { MaxContentWidth, Spacing } from '@/constants/theme';

export const BAR_HEIGHT = 64;
const ICON_SIZE = 20;
/** Width of the top line, as a share of one tab's width. */
const LINE_SHARE = 0.6;
const SWITCH_MS = 240;

const TABS: readonly {
  name: string;
  href: '/' | '/list' | '/report' | '/profile';
  label: string;
  accessibilityLabel?: string;
  icon: IconSvgElement;
}[] = [
  { name: 'index', href: '/', label: 'Map', icon: MapsIcon },
  { name: 'list', href: '/list', label: 'List', icon: LeftToRightListBulletIcon },
  {
    name: 'report',
    href: '/report',
    label: 'Report',
    accessibilityLabel: 'Report a stray',
    icon: Camera01Icon,
  },
  { name: 'profile', href: '/profile', label: 'Profile', icon: UserIcon },
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
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <TabBar>
          {TABS.map((tab) => (
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

function TabBar({ style, children, ...props }: ViewProps) {
  const insets = useSafeAreaInsets();
  const [surface, border, accent] = useThemeColor(['surface', 'border', 'accent']);
  const [rowWidth, setRowWidth] = useState(0);
  const isHidden = useSyncExternalStore(watchBar, () => isBarHidden);

  const pathname = usePathname();
  // Screens opened inside a tab (for example /report/form) keep that tab selected.
  const selected = Math.max(
    0,
    TABS.findIndex((tab) => tab.href !== '/' && pathname.startsWith(tab.href))
  );

  const tabWidth = rowWidth / TABS.length;
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
  icon: IconSvgElement;
};

function TabButton({ label, accessibilityLabel, icon, isFocused, ...props }: TabButtonProps) {
  const [accent, foreground, muted] = useThemeColor(['accent', 'foreground', 'muted']);
  const progress = useDerivedValue(
    () => withTiming(isFocused ? 1 : 0, { duration: SWITCH_MS }),
    [isFocused]
  );

  // A muted copy and a heavier accent copy cross-fade. The free icon set has no filled style,
  // so the selected icon is marked by colour and stroke weight.
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
          <HugeiconsIcon icon={icon} size={ICON_SIZE} color={muted} strokeWidth={1.5} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, activeStyle]}>
          <HugeiconsIcon icon={icon} size={ICON_SIZE} color={accent} strokeWidth={2} />
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
