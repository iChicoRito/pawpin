import { Image } from 'expo-image';
import { Skeleton, useThemeColor } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { HistoryReport } from '@/lib/claims';
import { formatAge } from '@/lib/format';
import { ANIMAL_TYPES, labelFor, REPORT_STATUSES } from '@/lib/reports';

const PHOTO_SIZE = 56;
/** About one screen of rows, so the page does not jump much when the real ones arrive. */
const SKELETON_ROWS = 6;

/** "October 2026", or "This month" for the month we are in. */
function monthOf(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return 'This month';
  }
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

type HistoryListProps = {
  /** Rescues are told by where and when; reports by what became of them. */
  kind: 'reports' | 'rescues';
  /** Newest first. */
  reports: HistoryReport[];
};

/**
 * A person's own history, month by month: reports they sent, or animals they rescued. A flat list
 * on the page, with lines between rows and no boxes. Rows are to read, not to press: the report
 * page shows only reports that are nearby and still active.
 */
export function HistoryList({ kind, reports }: HistoryListProps) {
  const [border, success, accent, muted] = useThemeColor(['border', 'success', 'accent', 'muted']);

  // Already newest first, so the months come out in order and each row joins the last month seen.
  const months: { title: string; rows: HistoryReport[] }[] = [];
  for (const report of reports) {
    const title = monthOf(kind === 'rescues' ? report.changedAt : report.createdAt);
    const last = months[months.length - 1];
    if (last?.title === title) last.rows.push(report);
    else months.push({ title, rows: [report] });
  }

  return (
    <View style={styles.months}>
      {months.map((month) => (
        <View key={month.title}>
          <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
            {month.title}
          </ThemedText>
          {month.rows.map((report, index) => {
            const animal = labelFor(ANIMAL_TYPES, report.animalType) || 'Animal';
            const status = labelFor(REPORT_STATUSES, report.status);
            const landmark = report.landmark?.trim();
            // A rescue is dated by when it ended; a report by when it was sent.
            const age = formatAge(kind === 'rescues' ? report.changedAt : report.createdAt);
            // Three meanings, three colors: still open, ended well, ended otherwise.
            const dot =
              report.status === 'rescued'
                ? success
                : report.status === 'reported' || report.status === 'responding'
                  ? accent
                  : muted;
            return (
              <View
                key={report.id}
                accessible
                aria-label={
                  kind === 'rescues'
                    ? `${animal}, rescued ${age.toLowerCase()}${landmark ? `, ${landmark}` : ''}`
                    : `${animal}, ${status}, sent ${age.toLowerCase()}`
                }
                style={styles.row}>
                {report.photo ? (
                  <Image source={{ uri: report.photo }} style={styles.photo} />
                ) : (
                  <ThemedView type="backgroundSelected" style={styles.photo} />
                )}
                {/* The line runs under the words only, so the photos read as one column. */}
                <View
                  style={[styles.body, index > 0 && styles.bodyDivided, { borderTopColor: border }]}>
                  <View style={styles.text}>
                    <ThemedText numberOfLines={1} style={styles.animal}>
                      {animal}
                    </ThemedText>
                    {kind === 'rescues' ? (
                      // Every row here is a rescue, so the second line says where instead.
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {landmark || 'No landmark given'}
                      </ThemedText>
                    ) : (
                      <View style={styles.status}>
                        <View style={[styles.dot, { backgroundColor: dot }]} />
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {status}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  {/* Digits of equal width, so the times line up down the list. */}
                  <ThemedText themeColor="textSecondary" style={styles.age}>
                    {age}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** The shape of the list while it is read: the count, a month, and its rows. */
export function HistoryListSkeleton({ label }: { label: string }) {
  return (
    <View accessible aria-busy aria-label={`Loading ${label}`} style={styles.skeleton}>
      <View style={styles.skeletonSummary}>
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="h-4 w-56 rounded-md" />
      </View>
      <View>
        <Skeleton className="h-4 w-24 rounded-md" />
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <View key={row} style={styles.row}>
            <Skeleton className="h-14 w-14 rounded-xl" />
            <View style={styles.body}>
              <View style={[styles.text, styles.skeletonText]}>
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-3 w-36 rounded-md" />
              </View>
              <Skeleton className="h-3 w-12 rounded-md" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Months sit further apart than the rows inside one.
  months: {
    gap: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.two + Spacing.half,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: PHOTO_SIZE + Spacing.three * 2,
  },
  bodyDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  animal: {
    fontWeight: 600,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // The smallest text on the row: it is read last.
  age: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  skeleton: {
    gap: Spacing.four,
  },
  skeletonSummary: {
    gap: Spacing.two,
  },
  skeletonText: {
    gap: Spacing.two,
  },
});
