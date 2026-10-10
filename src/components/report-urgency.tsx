import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import FirstAidKitIcon from '@hugeicons/core-free-icons/FirstAidKitIcon';
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { ListGroup } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { URGENCY_COLORS } from '@/lib/nearby';
import { URGENCIES, type ReportUrgency } from '@/lib/reports';

const URGENCY_ICONS: Record<ReportUrgency, IconSvgElement> = {
  critical: Alert02Icon,
  needs_help_soon: FirstAidKitIcon,
  just_sighted: ViewIcon,
};

export function ReportUrgencyCard({ urgency }: { urgency: ReportUrgency }) {
  const option = URGENCIES.find((entry) => entry.value === urgency);

  return (
    <ListGroup.Item style={styles.row}>
      <View aria-hidden style={[styles.icon, { backgroundColor: URGENCY_COLORS[urgency] }]}>
        <HugeiconsIcon icon={URGENCY_ICONS[urgency]} size={26} color="#FFFFFF" strokeWidth={1.8} />
      </View>
      <View style={styles.text}>
        <ThemedText role="heading" style={styles.heading}>
          {option?.label}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.description}>
          {option?.hint}
        </ThemedText>
      </View>
    </ListGroup.Item>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  icon: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: 400,
  },
});
