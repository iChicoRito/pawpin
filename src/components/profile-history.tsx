import { Image } from 'expo-image';
import { ListGroup, Separator, Skeleton } from 'heroui-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { HistoryReport } from '@/lib/claims';
import { formatAge } from '@/lib/format';
import { ANIMAL_TYPES, labelFor, REPORT_STATUSES } from '@/lib/reports';

const PHOTO_SIZE = 40;
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
 * A person's own history, month by month: reports they sent, or animals they rescued. Each month
 * is one HeroUI ListGroup, the same grouped list as on the "Report sent" screen: the photo first,
 * the name and one line under it, the time at the end. Rows are to read, not to press: the report
 * page shows only reports that are nearby and still active.
 */
export function HistoryList({ kind, reports }: HistoryListProps) {
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
        <View key={month.title} style={styles.month}>
          <ThemedText type="small" role="heading" themeColor="textSecondary">
            {month.title}
          </ThemedText>
          <ListGroup>
            {month.rows.map((report, index) => {
              const animal = labelFor(ANIMAL_TYPES, report.animalType) || 'Animal';
              const status = labelFor(REPORT_STATUSES, report.status);
              const landmark = report.landmark?.trim();
              // A rescue is dated by when it ended; a report by when it was sent.
              const age = formatAge(kind === 'rescues' ? report.changedAt : report.createdAt);
              return (
                <Fragment key={report.id}>
                  {index > 0 && <Separator className="mx-4" />}
                  {/* A row to read, not to press. */}
                  <ListGroup.Item
                    pointerEvents="none"
                    accessible
                    aria-label={
                      kind === 'rescues'
                        ? `${animal}, rescued ${age.toLowerCase()}${landmark ? `, ${landmark}` : ''}`
                        : `${animal}, ${status}, sent ${age.toLowerCase()}`
                    }>
                    <ListGroup.ItemPrefix>
                      {report.photo ? (
                        <Image source={{ uri: report.photo }} style={styles.photo} />
                      ) : (
                        <ThemedView type="backgroundSelected" style={styles.photo} />
                      )}
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>{animal}</ListGroup.ItemTitle>
                      {/* Every row under "Your rescues" is a rescue, so it says where instead. */}
                      <ListGroup.ItemDescription numberOfLines={1}>
                        {kind === 'rescues' ? landmark || 'No landmark given' : status}
                      </ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                    {/* The time, where a row that opens something would have its arrow. */}
                    <ListGroup.ItemSuffix>
                      <ThemedText themeColor="textSecondary" style={styles.age}>
                        {age}
                      </ThemedText>
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                </Fragment>
              );
            })}
          </ListGroup>
        </View>
      ))}
    </View>
  );
}

/** The shape of the list while it is read: the count, a month, and its rows. */
export function HistoryListSkeleton({ label }: { label: string }) {
  return (
    <View accessible aria-busy aria-label={`Loading ${label}`} style={styles.months}>
      <View style={styles.skeletonSummary}>
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="h-4 w-56 rounded-md" />
      </View>
      <View style={styles.month}>
        <Skeleton className="h-4 w-24 rounded-md" />
        <ListGroup>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <Fragment key={row}>
              {row > 0 && <Separator className="mx-4" />}
              <ListGroup.Item pointerEvents="none">
                <ListGroup.ItemPrefix>
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <View style={styles.skeletonText}>
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-3 w-36 rounded-md" />
                  </View>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <Skeleton className="h-3 w-12 rounded-md" />
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      </View>
    </View>
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
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.two + Spacing.half,
  },
  // The smallest text on the row: it is read last. Digits of equal width, so times line up.
  age: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  skeletonSummary: {
    gap: Spacing.two,
  },
  skeletonText: {
    gap: Spacing.two,
  },
});
