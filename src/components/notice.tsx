import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { Button, useThemeColor } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type NoticeProps = {
  icon: IconSvgElement;
  iconColor?: string;
  iconBackgroundColor?: string;
  title: string;
  text: string;
  /** Left out when there is nothing to do about it. */
  action?: string;
  onAction?: () => void;
  /** Read out at once, for a failure. */
  isAlert?: boolean;
};

/** An icon, a line, a sentence, and one thing to do. For an empty list and for a failed read. */
export function Notice({
  icon,
  iconColor,
  iconBackgroundColor,
  title,
  text,
  action,
  onAction,
  isAlert = false,
}: NoticeProps) {
  const muted = useThemeColor('muted');
  return (
    <View role={isAlert ? 'alert' : undefined} style={styles.notice}>
      <ThemedView
        type="backgroundElement"
        style={[styles.icon, iconBackgroundColor ? { backgroundColor: iconBackgroundColor } : undefined]}>
        <HugeiconsIcon icon={icon} size={28} color={iconColor ?? muted} />
      </ThemedView>
      <View style={styles.text}>
        <ThemedText role="heading" style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.line}>
          {text}
        </ThemedText>
      </View>
      {action && (
        <Button variant="secondary" onPress={onAction}>
          {action}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same shape as the List tab's empty state.
  notice: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Narrow enough that the sentence breaks into even lines instead of running edge to edge.
  text: {
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: 300,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
    textAlign: 'center',
  },
  line: {
    fontWeight: 400,
    textAlign: 'center',
  },
});
