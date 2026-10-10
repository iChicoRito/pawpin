import Flag02Icon from '@hugeicons/core-free-icons/Flag02Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Image } from 'expo-image';
import { Chip, ListGroup, Separator, useThemeColor } from 'heroui-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthOf } from '@/components/profile-history';
import { LiveDot } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { FlaggedReport } from '@/lib/flags';
import { formatAge } from '@/lib/format';
import { ANIMAL_TYPES, labelFor } from '@/lib/reports';

/** Same size as the photo on a row of the nearby List. */
const PHOTO_SIZE = 56;

// Responding uses the nearby list's live indicator; other statuses stay as quiet chips.
const STATUS_CHIPS: Record<
  string,
  {
    label: string;
    color: 'accent' | 'success' | 'default';
    variant: 'primary' | 'soft' | 'secondary';
  }
> = {
  reported: { label: 'Waiting', color: 'accent', variant: 'secondary' },
  responding: { label: 'On the way', color: 'success', variant: 'primary' },
  rescued: { label: 'Rescued', color: 'success', variant: 'soft' },
  not_found: { label: 'Not found', color: 'default', variant: 'secondary' },
  closed: { label: 'Closed', color: 'default', variant: 'secondary' },
};

type AdminReportRowsProps = {
  /** Newest first. */
  reports: FlaggedReport[];
  /** Which time a row shows: when the report was sent, or when it was last flagged. */
  datedBy: 'sent' | 'flag';
  /** Opens the report. */
  onPress: (reportId: string) => void;
};

const dateOf = (report: FlaggedReport, datedBy: AdminReportRowsProps['datedBy']) =>
  datedBy === 'flag' ? report.changedAt : report.createdAt;

/** The admin's reports month by month, each month one `AdminReportRows`. */
export function AdminReportList({ reports, datedBy, onPress }: AdminReportRowsProps) {
  // Already newest first, so the months come out in order and each row joins the last month seen.
  const months: { title: string; rows: FlaggedReport[] }[] = [];
  for (const report of reports) {
    const title = monthOf(dateOf(report, datedBy));
    const last = months[months.length - 1];
    if (last?.title === title) last.rows.push(report);
    else months.push({ title, rows: [report] });
  }

  return (
    <View style={styles.months}>
      {months.map((month) => (
        <View key={month.title} style={styles.month}>
          <ThemedText type="small" role="heading" themeColor="textSecondary">
            {month.title}
          </ThemedText>
          <AdminReportRows reports={month.rows} datedBy={datedBy} onPress={onPress} />
        </View>
      ))}
    </View>
  );
}

/**
 * One grouped list of reports: the animal and time, then status and flag count.
 * Flag reasons and location are on the report's own page.
 */
export function AdminReportRows({ reports, datedBy, onPress }: AdminReportRowsProps) {
  const danger = useThemeColor('danger');
  return (
    <ListGroup>
      {reports.map((report, index) => {
        const animal = labelFor(ANIMAL_TYPES, report.animalType) || 'Animal';
        const status = STATUS_CHIPS[report.status] ?? STATUS_CHIPS.closed;
        const age = formatAge(dateOf(report, datedBy));
        const flags = report.flagCount === 1 ? '1 flag' : `${report.flagCount} flags`;
        const spoken = [
          animal,
          status.label,
          report.flagCount > 0 && `${flags}: ${report.reasons.join(', ')}`,
          `${datedBy === 'flag' ? 'flagged' : 'reported'} ${age.toLowerCase()}`,
        ]
          .filter(Boolean)
          .join(', ');

        return (
          <Fragment key={report.id}>
            {index > 0 && <Separator className="mx-4" />}
            <ListGroup.Item
              role="button"
              aria-label={spoken}
              onPress={() => onPress(report.id)}
              style={styles.row}>
              <ListGroup.ItemPrefix>
                {report.photo ? (
                  <Image source={{ uri: report.photo }} style={styles.photo} />
                ) : (
                  <ThemedView type="backgroundSelected" style={styles.photo} />
                )}
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <View style={styles.content}>
                  {/* The animal, and at the far end when. The time is the quietest thing here. */}
                  <View style={styles.top}>
                    <ListGroup.ItemTitle numberOfLines={1} style={styles.animal}>
                      {animal}
                    </ListGroup.ItemTitle>
                    <ThemedText themeColor="textSecondary" style={styles.age}>
                      {age}
                    </ThemedText>
                  </View>

                  <View style={styles.chips}>
                    {report.status === 'responding' ? (
                      <View style={styles.responding}>
                        <View aria-hidden>
                          <LiveDot />
                        </View>
                        <ThemedText type="small">On the way</ThemedText>
                      </View>
                    ) : (
                      <Chip size="sm" variant={status.variant} color={status.color}>
                        {status.label}
                      </Chip>
                    )}
                    {report.flagCount > 0 && (
                      <Chip size="sm" variant="soft" color="danger">
                        <HugeiconsIcon icon={Flag02Icon} size={12} color={danger} strokeWidth={2} />
                        <Chip.Label>{flags}</Chip.Label>
                      </Chip>
                    )}
                  </View>

                </View>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </Fragment>
        );
      })}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  // Months sit further apart than a month's name and its list.
  months: {
    gap: Spacing.four,
  },
  month: {
    gap: Spacing.two,
  },
  // The photo stays level with the first line, however many lines the row has.
  row: {
    alignItems: 'flex-start',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.two + Spacing.one,
  },
  content: {
    gap: Spacing.one + Spacing.half,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  // Gives way to the time on a narrow phone, never the other way round.
  animal: {
    flex: 1,
  },
  // The smallest text on the row: it is read last. Digits of equal width, so times line up.
  age: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  responding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
});
