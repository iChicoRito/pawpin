import MapsSearchIcon from '@hugeicons/core-free-icons/MapsSearchIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { Alert, Button, Typography, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationGate } from '@/components/location-gate';
import { ListFilter, type ReportOwner } from '@/components/list-filter';
import { ReportRow, ReportListSkeleton } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { useSession } from '@/hooks/use-session';
import { RADIUS_CHOICES } from '@/lib/nearby';

const TITLE = 'Nearby strays';
const OWNER_SUMMARY: Record<ReportOwner, string> = {
  all: 'All reports',
  mine: 'Your reports',
  others: 'Reports from others',
};
/** About one screen of rows, so the page does not jump much when the real ones arrive. */
const SKELETON_CARDS = 5;

// Phones only. Browsers get list.web.tsx.
export default function ListScreen() {
  return (
    <LocationGate title={TITLE}>
      <NearbyList />
    </LocationGate>
  );
}

function NearbyList() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const router = useRouter();
  const { reports, radiusM, status, failure, refresh, setRadius } = useNearbyReports();
  const muted = useThemeColor('muted');
  const [isPulling, setIsPulling] = useState(false);
  const { session } = useSession();
  // Whose reports to show. Kept while the app is open, like the distance.
  const [owner, setOwner] = useState<ReportOwner>('all');
  const shown =
    owner === 'all'
      ? reports
      : reports.filter((report) => (report.reporterId === session?.user.id) === (owner === 'mine'));

  // Tabs stay mounted, so this runs each time the List comes back into view, not only once.
  useEffect(() => {
    if (isFocused) refresh();
    // `refresh` is a new function on every render; only coming into view should search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const isLoading = status === 'loading';
  const radius = RADIUS_CHOICES.find((choice) => choice.value === radiusM)?.label ?? '';
  // The next distance up, to offer from an empty list. None at the widest.
  const wider = RADIUS_CHOICES.find((choice) => choice.value > radiusM);

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={shown}
        keyExtractor={(report) => report.id}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={styles.cardGap} />}
        renderItem={({ item }) => (
          <ReportRow
            report={item}
            onOpen={(report) =>
              router.push({ pathname: '/report/[id]', params: { id: report.id } })
            }
          />
        )}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}
        refreshing={isPulling}
        onRefresh={async () => {
          setIsPulling(true);
          await refresh();
          setIsPulling(false);
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* The button sits level with the middle of the two lines beside it. */}
            <View style={styles.titleRow}>
              <View style={styles.title}>
                <Typography type="h3" role="heading">
                  {TITLE}
                </Typography>
                {/* The filter is out of sight in its drawer, so what it is set to is said here. */}
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  aria-live="polite"
                  style={styles.regular}>
                  {OWNER_SUMMARY[owner]} · Within {radius}
                </ThemedText>
              </View>
              <ListFilter owner={owner} onOwnerChange={setOwner} />
            </View>
            {failure && !isLoading && (
              <View style={styles.failure}>
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      {failure === 'location'
                        ? 'Could not find your location. Check that location is on, or move near a window, then try again.'
                        : 'Could not load reports. Check your connection and try again.'}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
                <Button variant="secondary" onPress={refresh}>
                  Try again
                </Button>
              </View>
            )}
          </View>
        }
        // In the footer, not the empty slot: only the footer can be stretched to fill the rest of the
        // screen, which is what lets the empty message sit in the middle of it.
        ListFooterComponentStyle={styles.footer}
        ListFooterComponent={
          shown.length > 0 ? null : isLoading && !isPulling ? (
            // The pull-down spinner already shows a refresh; these stand in for a list with nothing yet.
            // Read out as one line, not as a row of empty shapes.
            <View accessible aria-busy aria-label="Looking for strays near you">
              <ReportListSkeleton rows={SKELETON_CARDS} />
            </View>
          ) : status === 'ready' ? (
            <View style={styles.empty}>
              <ThemedView type="backgroundElement" style={styles.emptyIcon}>
                <HugeiconsIcon icon={MapsSearchIcon} size={28} color={muted} />
              </ThemedView>
              <View style={styles.emptyText}>
                <ThemedText role="heading" style={styles.emptyTitle}>
                  {owner === 'mine'
                    ? `None of your reports within ${radius}`
                    : owner === 'others'
                      ? `No reports from others within ${radius}`
                      : `No strays within ${radius}`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  {reports.length > 0
                    ? 'There are reports nearby that this filter leaves out.'
                    : wider
                      ? 'Nobody has reported a stray this close to you. Look further out, or pull down to check again.'
                      : 'Nobody has reported a stray this far out. Pull down to check again.'}
                </ThemedText>
              </View>
              {reports.length > 0 ? (
                <Button variant="secondary" onPress={() => setOwner('all')}>
                  Show all reports
                </Button>
              ) : wider ? (
                <Button variant="secondary" onPress={() => setRadius(wider.value)}>
                  Search within {wider.label}
                </Button>
              ) : (
                <Button variant="secondary" onPress={refresh}>
                  Check again
                </Button>
              )}
            </View>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  cardGap: {
    height: Spacing.two,
  },
  regular: {
    fontWeight: 400,
  },
  container: {
    flex: 1,
  },
  // Same column as the Profile tab. Cards sit closer to each other than to the header.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    // At least as tall as the screen, so the footer has room to stretch into.
    flexGrow: 1,
  },
  footer: {
    flexGrow: 1,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  // The title at the column's left edge, the filter button at its right edge: the same edges
  // the cards under them have.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  // The title and the line under it. Gives way to the button on a narrow phone.
  title: {
    flex: 1,
    gap: Spacing.one,
  },
  failure: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  // Fills what is left under the header and holds its content in the middle of it.
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Narrow enough that the sentence breaks into even lines instead of running edge to edge.
  emptyText: {
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: 300,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
    textAlign: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
