import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import HeartCheckIcon from '@hugeicons/core-free-icons/HeartCheckIcon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryList, HistoryListSkeleton } from '@/components/profile-history';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { fetchMyReports, fetchMyRescues, type HistoryReport } from '@/lib/claims';

// The two lists this screen can show. Opened from the Profile tab's menu.
const KINDS = {
  reports: {
    kind: 'reports',
    title: 'Your reports',
    label: 'your reports',
    count: (total: number) => (total === 1 ? '1 report sent' : `${total} reports sent`),
    about: 'Every stray you reported, and what became of it.',
    icon: Megaphone01Icon,
    emptyTitle: 'No reports yet',
    empty: 'When you report a stray, it is kept here with what became of it.',
    action: 'Report a stray',
    fetch: fetchMyReports,
  },
  rescues: {
    kind: 'rescues',
    title: 'Your rescues',
    label: 'your rescues',
    count: (total: number) => (total === 1 ? '1 animal rescued' : `${total} animals rescued`),
    about: 'Every animal you went to and marked as rescued.',
    icon: HeartCheckIcon,
    emptyTitle: 'No rescues yet',
    empty: 'Go to a stray near you and mark it as rescued. It is kept here from then on.',
    action: 'See strays near you',
    fetch: fetchMyRescues,
  },
} as const;

/** The viewer's own history: the reports they sent, or the animals they rescued. */
export default function HistoryScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id;
  const list = kind === 'rescues' ? KINDS.rescues : KINDS.reports;
  // `undefined` while being read, `null` when it could not be.
  const [reports, setReports] = useState<HistoryReport[] | null | undefined>(undefined);
  const [isPulling, setIsPulling] = useState(false);
  // Counts tries, so "Try again" and a pull down read once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let isGone = false;
    list
      .fetch(userId)
      .then((found) => {
        if (!isGone) setReports(found);
      })
      .catch((error) => {
        console.warn(`Loading ${list.label} failed:`, error);
        if (!isGone) setReports(null);
      })
      .finally(() => {
        if (!isGone) setIsPulling(false);
      });
    return () => {
      isGone = true;
    };
  }, [userId, list, attempt]);

  // Nothing to list: the message sits in the middle of the screen instead of under a heading.
  const isCentered = reports === null || reports?.length === 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: list.title }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.four },
          isCentered && styles.centered,
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
        {reports === undefined ? (
          <HistoryListSkeleton label={list.label} />
        ) : reports === null ? (
          <Notice
            icon={AlertCircleIcon}
            title={`Could not load ${list.label}`}
            text="Check your connection and try again."
            action="Try again"
            onAction={() => {
              setReports(undefined);
              setAttempt(attempt + 1);
            }}
            isAlert
          />
        ) : reports.length === 0 ? (
          <Notice
            icon={list.icon}
            title={list.emptyTitle}
            text={list.empty}
            action={list.action}
            // Straight to where the first one is made: the Report tab, or the List of strays.
            onAction={() => router.navigate(list.kind === 'rescues' ? '/list' : '/report')}
          />
        ) : (
          <>
            {/* The one large line on the page: how many. Then what the list is. */}
            <View style={styles.summary}>
              <ThemedText role="heading" style={styles.count}>
                {list.count(reports.length)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {list.about}
              </ThemedText>
            </View>
            <HistoryList kind={list.kind} reports={reports} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

type NoticeProps = {
  icon: IconSvgElement;
  title: string;
  text: string;
  action: string;
  onAction: () => void;
  /** Read out at once, for a failure. */
  isAlert?: boolean;
};

/** An icon, a line, a sentence, and one thing to do. For the empty list and for a failed read. */
function Notice({ icon, title, text, action, onAction, isAlert = false }: NoticeProps) {
  const muted = useThemeColor('muted');
  return (
    <View role={isAlert ? 'alert' : undefined} style={styles.notice}>
      <ThemedView type="backgroundElement" style={styles.noticeIcon}>
        <HugeiconsIcon icon={icon} size={28} color={muted} />
      </ThemedView>
      <View style={styles.noticeText}>
        <ThemedText role="heading" style={styles.noticeTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.noticeLine}>
          {text}
        </ThemedText>
      </View>
      <Button variant="secondary" onPress={onAction}>
        {action}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the Settings screen. The summary sits apart from the list under it.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  // As tall as the screen, so the message can sit in the middle of it.
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  summary: {
    gap: Spacing.one,
  },
  // Same size as the animal's name on the report page.
  count: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  // Same shape as the List tab's empty state.
  notice: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  noticeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Narrow enough that the sentence breaks into even lines instead of running edge to edge.
  noticeText: {
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: 300,
  },
  noticeTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
    textAlign: 'center',
  },
  noticeLine: {
    fontWeight: 400,
    textAlign: 'center',
  },
});
