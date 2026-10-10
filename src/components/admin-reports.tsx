import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import Flag02Icon from '@hugeicons/core-free-icons/Flag02Icon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Tabs, Typography } from 'heroui-native';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/notice';
import { AdminReportList } from '@/components/admin-report-rows';
import { HistoryListSkeleton } from '@/components/profile-history';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ADMIN_FILTERS, fetchAdminReports, type AdminFilter } from '@/lib/admin';
import type { FlaggedReport } from '@/lib/flags';

// What each filter calls its reports, and what it says when it has none.
const WORDS: Record<AdminFilter, { one: string; many: string; emptyTitle: string; empty: string }> =
  {
    all: {
      one: 'report',
      many: 'reports',
      emptyTitle: 'No reports yet',
      empty: 'Reports from every user are listed here as they come in.',
    },
    flagged: {
      one: 'flagged report',
      many: 'flagged reports',
      emptyTitle: 'No flagged reports',
      empty: 'When someone flags a report, it is listed here with the reason.',
    },
    open: {
      one: 'open report',
      many: 'open reports',
      emptyTitle: 'No open reports',
      empty: 'Every report so far has ended.',
    },
    finished: {
      one: 'finished report',
      many: 'finished reports',
      emptyTitle: 'No finished reports',
      empty: 'Reports that end as rescued, not found, or closed are listed here.',
    },
  };

// What the database answered for one filter. Kept with its filter, so one filter's reports are
// never shown under another's name.
type Answer =
  | { filter: AdminFilter; reports: FlaggedReport[]; total: number }
  | { filter: AdminFilter; reports: null };

/**
 * The admin's second tab, in place of the nearby List: every report from everywhere, newest first,
 * whatever its status. The filter is in the address (`/list?filter=flagged`), so the Dashboard can
 * open this tab on one. No location is read, so it runs in a browser too.
 */
export function AdminReports() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = ADMIN_FILTERS.find((choice) => choice.value === params.filter)?.value ?? 'all';
  const words = WORDS[filter];

  const [answer, setAnswer] = useState<Answer>();
  const [isPulling, setIsPulling] = useState(false);
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  // Counts tries, so "Try again" and a pull down read once more.
  const [attempt, setAttempt] = useState(0);
  // `undefined` while this filter is being read, `reports: null` when it could not be.
  const shown = answer?.filter === filter ? answer : undefined;

  // Tabs stay mounted, so this also runs each time the tab comes back into view: a report may have
  // just been closed from its own page.
  // ponytail: coming back reads the first 30 again and drops any "Show more" pages. Keep the
  // pages and refresh them in place if admins start working deep in the list.
  useEffect(() => {
    if (!isFocused) return;
    let isGone = false;
    fetchAdminReports(filter, 0)
      .then((found) => {
        if (isGone) return;
        setAnswer({ filter, ...found });
        setMore('idle');
      })
      .catch((error) => {
        console.warn('Loading reports failed:', error);
        // A quiet read that fails leaves the list as it was.
        if (!isGone) {
          setAnswer((known) =>
            known?.filter === filter && known.reports ? known : { filter, reports: null },
          );
        }
      })
      .finally(() => {
        if (!isGone) setIsPulling(false);
      });
    return () => {
      isGone = true;
    };
  }, [filter, isFocused, attempt]);

  async function showMore() {
    if (!shown?.reports) return;
    setMore('loading');
    try {
      const next = await fetchAdminReports(filter, shown.reports.length);
      setAnswer((known) =>
        known?.filter === filter && known.reports
          ? { filter, reports: [...known.reports, ...next.reports], total: next.total }
          : known,
      );
      setMore('idle');
    } catch (error) {
      console.warn('Loading more reports failed:', error);
      setMore('failed');
    }
  }

  const reports = shown?.reports;
  const total = shown?.reports ? shown.total : 0;
  // Nothing to list: the message sits in what is left of the screen, not under the filter.
  const isCentered = reports === null || reports?.length === 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}
        refreshControl={
          <RefreshControl
            refreshing={isPulling}
            onRefresh={() => {
              setIsPulling(true);
              setAttempt(attempt + 1);
            }}
          />
        }>
        <View style={styles.title}>
          <Typography type="h3" role="heading">
            Reports
          </Typography>
          {/* How many the filter matches, said again when the filter changes. */}
          <ThemedText
            type="small"
            themeColor="textSecondary"
            aria-live="polite"
            style={styles.regular}>
            {!reports
              ? 'From every user, newest first'
              : `${total} ${total === 1 ? words.one : words.many}, newest first`}
          </ThemedText>
        </View>

        <Tabs
          aria-label="Which reports to show"
          value={filter}
          onValueChange={(value) => router.setParams({ filter: value })}>
          <Tabs.List className="self-stretch">
            <Tabs.Indicator />
            {ADMIN_FILTERS.map((choice) => (
              <Tabs.Trigger key={choice.value} value={choice.value} className="flex-1">
                <Tabs.Label>{choice.label}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>

        <View style={isCentered && styles.centered}>
          {reports === undefined ? (
            <HistoryListSkeleton label="reports" />
          ) : reports === null ? (
            <Notice
              icon={AlertCircleIcon}
              title="Could not load reports"
              text="Check your connection and try again."
              action="Try again"
              onAction={() => {
                setAnswer(undefined);
                setAttempt(attempt + 1);
              }}
              isAlert
            />
          ) : reports.length === 0 ? (
            <Notice
              icon={filter === 'flagged' ? Flag02Icon : LeftToRightListBulletIcon}
              title={words.emptyTitle}
              text={words.empty}
            />
          ) : (
            <View style={styles.list}>
              <AdminReportList
                datedBy="sent"
                reports={reports}
                onPress={(id) => router.push({ pathname: '/report/[id]', params: { id } })}
              />
              {reports.length < total && (
                <View style={styles.more}>
                  {more === 'failed' && (
                    <ThemedText type="small" role="alert" style={styles.moreFailed}>
                      Could not load more. Check your connection and try again.
                    </ThemedText>
                  )}
                  <Button variant="secondary" isDisabled={more === 'loading'} onPress={showMore}>
                    {more === 'loading' ? 'Loading…' : `Show more (${total - reports.length} left)`}
                  </Button>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the Profile tab. At least as tall as the screen, so an empty message has room
  // to sit in the middle of what is left.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    flexGrow: 1,
  },
  title: {
    gap: Spacing.one,
  },
  regular: {
    fontWeight: 400,
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  list: {
    gap: Spacing.four,
  },
  more: {
    gap: Spacing.two,
  },
  moreFailed: {
    textAlign: 'center',
  },
});
