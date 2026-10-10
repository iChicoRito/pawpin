import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Flag02Icon from '@hugeicons/core-free-icons/Flag02Icon';
import HourglassIcon from '@hugeicons/core-free-icons/HourglassIcon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import Route01Icon from '@hugeicons/core-free-icons/Route01Icon';
import { useIsFocused, useRouter } from 'expo-router';
import { Button, Typography, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChartCard,
  Columns,
  DayBars,
  OUTCOME_COLORS,
  Ring,
  ShareBar,
  StatCard,
  Tiles,
  URGENCY_CHART_COLORS,
  useSeriesColors,
} from '@/components/admin-charts';
import { Notice } from '@/components/notice';
import { AdminReportRows } from '@/components/admin-report-rows';
import { HistoryListSkeleton } from '@/components/profile-history';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  fetchAdminOverview,
  fetchAdminStats,
  type AdminFilter,
  type AdminOverview,
  type AdminStats,
} from '@/lib/admin';
import {
  FLAG_REASONS,
  fetchFlaggedReports,
  type FlaggedReport,
  type FlagReason,
} from '@/lib/flags';
import { ANIMAL_TYPES, labelFor, URGENCIES } from '@/lib/reports';

/** How many flagged reports are shown here before "See all". */
const FLAGGED_SHOWN = 3;

type Answer = {
  overview: AdminOverview;
  stats: AdminStats;
  flagged: { reports: FlaggedReport[]; total: number };
};

/** "12 min", "3 h", "2 days": how long half of the answered reports waited for a rescuer. */
function formatWait(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * The admin's first tab, in place of the Map. The numbers that say how things stand come first,
 * then what needs the admin: flagged reports, and reports about to close by themselves. Under
 * those, the charts. Cards that count reports open the Reports tab on that filter. No map and no
 * location, so it runs in a browser too.
 */
export function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  // `undefined` while being read, `null` when it could not be.
  const [answer, setAnswer] = useState<Answer | null | undefined>(undefined);
  const [isPulling, setIsPulling] = useState(false);
  // Counts tries, so "Try again" and a pull down read once more.
  const [attempt, setAttempt] = useState(0);

  // Tabs stay mounted, so this runs each time the Dashboard comes back into view: a report may
  // have just been closed from its own page.
  useEffect(() => {
    if (!isFocused) return;
    let isGone = false;
    Promise.all([fetchAdminOverview(), fetchAdminStats(), fetchFlaggedReports(true)])
      .then(([overview, stats, flagged]) => {
        if (!isGone) setAnswer({ overview, stats, flagged });
      })
      .catch((error) => {
        console.warn('Loading the dashboard failed:', error);
        // A quiet read that fails leaves the numbers as they were.
        if (!isGone) setAnswer((known) => known ?? null);
      })
      .finally(() => {
        if (!isGone) setIsPulling(false);
      });
    return () => {
      isGone = true;
    };
  }, [isFocused, attempt]);

  const open = (filter: AdminFilter) => router.navigate({ pathname: '/list', params: { filter } });
  const openReport = (id: string) => router.push({ pathname: '/report/[id]', params: { id } });

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.four },
          answer === null && styles.centered,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isPulling}
            onRefresh={() => {
              setIsPulling(true);
              setAttempt(attempt + 1);
            }}
          />
        }>
        {answer === null ? (
          <Notice
            icon={AlertCircleIcon}
            title="Could not load the dashboard"
            text="Check your connection and try again."
            action="Try again"
            onAction={() => {
              setAnswer(undefined);
              setAttempt(attempt + 1);
            }}
            isAlert
          />
        ) : (
          <>
            <Typography type="h3" role="heading">
              Dashboard
            </Typography>
            {!answer ? (
              <HistoryListSkeleton label="the dashboard" />
            ) : (
              <Widgets answer={answer} onOpen={open} onOpenReport={openReport} />
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

type WidgetsProps = {
  answer: Answer;
  onOpen: (filter: AdminFilter) => void;
  onOpenReport: (id: string) => void;
};

function Widgets({ answer: { overview, stats, flagged }, onOpen, onOpenReport }: WidgetsProps) {
  const finished = overview.rescued + overview.notFound + overview.closed;
  const active = overview.reported + overview.responding;
  const sent = stats.days.reduce((sum, day) => sum + day.count, 0);
  const series = useSeriesColors();
  const flags = stats.flagReasons.reduce((sum, reason) => sum + reason.count, 0);
  const reported = stats.animals.reduce((sum, animal) => sum + animal.count, 0);

  return (
    <>
      {/* How things stand right now, two to a row. Each count leads to its reports. */}
      <View style={styles.grid}>
        <View style={styles.pair}>
          <StatCard
            icon={HourglassIcon}
            label="Waiting"
            value={String(overview.reported)}
            hint="Reports no rescuer has gone to yet. Opens the open reports"
            onPress={() => onOpen('open')}
          />
          <StatCard
            icon={Route01Icon}
            label="On the way"
            value={String(overview.responding)}
            hint="Reports a rescuer is going to now. Opens the open reports"
            onPress={() => onOpen('open')}
          />
        </View>
        <View style={styles.pair}>
          <StatCard
            icon={Flag02Icon}
            // Red only while there is something to look at.
            isAlert={overview.flagged > 0}
            label="Flagged"
            value={String(overview.flagged)}
            hint="Active reports that users flagged. Opens the flagged reports"
            onPress={() => onOpen('flagged')}
          />
          <StatCard
            icon={Megaphone01Icon}
            label="This week"
            value={String(stats.thisWeek)}
            hint="Reports sent in the last 7 days. Opens all reports"
            onPress={() => onOpen('all')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" role="heading" themeColor="textSecondary">
          Needs a look
        </ThemedText>
        {flagged.reports.length === 0 ? (
          <AllClear />
        ) : (
          <>
            <AdminReportRows
              datedBy="flag"
              reports={flagged.reports.slice(0, FLAGGED_SHOWN)}
              onPress={onOpenReport}
            />
            {flagged.total > FLAGGED_SHOWN && (
              <Button variant="secondary" onPress={() => onOpen('flagged')}>
                See all {flagged.total} flagged reports
              </Button>
            )}
          </>
        )}
      </View>

      {/* Only when there are some: most days nothing is this old. */}
      {stats.closingSoon.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="small" role="heading" themeColor="textSecondary">
            Closing by themselves soon
          </ThemedText>
          <AdminReportRows datedBy="sent" reports={stats.closingSoon} onPress={onOpenReport} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
            Nobody has touched these for over 48 hours. At 72 hours they close by themselves.
          </ThemedText>
        </View>
      )}

      <ChartCard title="Reports per day" summary={`${sent} in the last 14 days`}>
        <DayBars days={stats.days} />
      </ChartCard>

      <ChartCard
        title="How reports ended"
        summary={
          finished === 0
            ? undefined
            : `${Math.round((overview.rescued / finished) * 100)}% rescued, of ${finished} finished`
        }
        hint="Opens the finished reports"
        onPress={() => onOpen('finished')}>
        {finished === 0 ? (
          <Notice
            icon={CheckmarkCircle02Icon}
            title="No finished reports yet"
            text="Rescue outcomes will appear here when reports are marked rescued, not found, or closed."
          />
        ) : (
          <ShareBar
            shares={[
              { label: 'Rescued', count: overview.rescued, color: OUTCOME_COLORS.rescued },
              { label: 'Not found', count: overview.notFound, color: OUTCOME_COLORS.not_found },
              { label: 'Closed', count: overview.closed, color: OUTCOME_COLORS.closed },
            ]}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Urgency of active reports"
        summary={
          active === 0
            ? undefined
            : `${stats.urgency.critical} of ${active} critical`
        }>
        {active === 0 ? (
          <Notice
            icon={AlertCircleIcon}
            title="No active reports"
            text="Urgency levels will appear here when reports are waiting for help or a rescuer is on the way."
          />
        ) : (
          <Ring
            unit={active === 1 ? 'active report' : 'active reports'}
            shares={URGENCIES.map((urgency) => ({
              label: urgency.label,
              count: stats.urgency[urgency.value],
              color: URGENCY_CHART_COLORS[urgency.value],
            }))}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Time until a rescuer is on the way"
        summary={
          stats.responseMinutes === null
            ? undefined
            : formatWait(stats.responseMinutes)
        }>
        {stats.responseMinutes === null ? (
          <Notice
            icon={Route01Icon}
            title="No response times yet"
            text="Typical response time will appear here once a rescuer responds to a report from the last 30 days."
          />
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
            Half of the reports a rescuer went to, in the last 30 days, were taken within this time.
          </ThemedText>
        )}
      </ChartCard>

      <ChartCard
        title="Why reports are flagged"
        summary={
          flags === 0
            ? undefined
            : `${flags === 1 ? '1 flag' : `${flags} flags`}, most for "${stats.flagReasons[0].label}"`
        }>
        {flags === 0 ? (
          <Notice
            icon={Flag02Icon}
            title="No flags to review"
            text="Reasons will appear here when someone flags a report for review."
          />
        ) : (
          <Tiles
            // Each reason keeps its color wherever it ranks: the order is the app's own list.
            shares={stats.flagReasons.map((reason) => ({
              ...reason,
              color:
                series[
                  Math.max(0, FLAG_REASONS.indexOf(reason.label as FlagReason)) % series.length
                ],
            }))}
          />
        )}
      </ChartCard>

      <ChartCard title="Animals reported">
        {reported === 0 ? (
          <Notice
            icon={Megaphone01Icon}
            title="No animals reported yet"
            text="A breakdown of dogs, cats, and other animals will appear here as reports are submitted."
          />
        ) : (
          <Columns
            rows={stats.animals.map((animal) => ({
              // Dog, Cat, Other: the same three words as on the report form.
              label: labelFor(ANIMAL_TYPES, animal.label),
              count: animal.count,
            }))}
          />
        )}
      </ChartCard>
    </>
  );
}

/** In place of the flagged rows when there are none: said plainly, so the gap is not a question. */
function AllClear() {
  const [success, successBackground] = useThemeColor(['success-soft-foreground', 'success-soft']);
  return (
    <ThemedView type="backgroundElement" style={styles.clear}>
      <Notice
        icon={CheckmarkCircle02Icon}
        iconColor={success}
        iconBackgroundColor={successBackground}
        title="No flagged reports"
        text="Active reports flagged by users will appear here for review."
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the Profile tab.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  // As tall as the screen, so the failure message can sit in the middle of it.
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  regular: {
    fontWeight: 400,
  },
  // The cards sit closer to each other than the stack does to what is under it.
  grid: {
    gap: Spacing.two,
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // A heading sits closer to its own list than to the section before it.
  section: {
    gap: Spacing.two,
  },
  clear: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
