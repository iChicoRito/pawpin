import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar, Button, Chip, Skeleton, Tabs, useThemeColor } from 'heroui-native';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { URGENCY_CHIP } from '@/components/report-card';
import { PhotoThumb } from '@/components/report-photo';
import { ReportPlaceMap } from '@/components/report-place-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { useSession } from '@/hooks/use-session';
import { formatAge, formatDistance, initialsOf } from '@/lib/format';
import { URGENCY_COLORS } from '@/lib/nearby';
import { ANIMAL_TYPES, COLORS, CONDITIONS, labelFor, SIZES, URGENCIES } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

/** The photo is as wide as the screen and three quarters as tall, up to this height. */
const PHOTO_MAX_HEIGHT = 360;

/** One report in full: what a rescuer reads before deciding to go. */
export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { reports } = useNearbyReports();
  const { session } = useSession();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [tab, setTab] = useState<'report' | 'reporter'>('report');
  // Read from the reports the Map and the List already hold. Nothing is fetched here.
  const report = reports.find((candidate) => candidate.id === id);

  const reporter = useReporter(report?.reporterId);

  if (!report) {
    return (
      <ThemedView style={[styles.container, styles.missing]}>
        <ThemedText role="alert" style={styles.centered}>
          This report is no longer nearby.
        </ThemedText>
        <Button variant="secondary" onPress={() => router.back()}>
          Back
        </Button>
      </ThemedView>
    );
  }

  const animal = labelFor(ANIMAL_TYPES, report.animalType) || 'Animal';
  const urgency = labelFor(URGENCIES, report.urgency);
  const isMine = report.reporterId === session?.user.id;
  const isResponding = report.status === 'responding';
  const photoWidth = Math.min(window.width, MaxContentWidth);
  const photoHeight = Math.min(photoWidth * 0.75, PHOTO_MAX_HEIGHT);

  // Only what the reporter gave. A report sent with the required answers alone shows no empty rows.
  const details = [
    { label: 'Animal', value: animal },
    { label: 'Condition', value: labelFor(CONDITIONS, report.condition) },
    { label: 'Size', value: labelFor(SIZES, report.size) },
    { label: 'Color', value: labelFor(COLORS, report.color) },
  ].filter((detail) => detail.value);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.five }}>
        {/* The photo leads: edge to edge, no frame, because recognising the animal comes first. */}
        {report.photos.length > 0 && (
          <View style={[styles.photos, { width: photoWidth, height: photoHeight }]}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEnabled={report.photos.length > 1}
              onMomentumScrollEnd={(event) =>
                setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / photoWidth))
              }>
              {report.photos.map((uri, index) => (
                <PhotoThumb
                  key={uri}
                  uri={uri}
                  label={`Photo ${index + 1}`}
                  style={{ width: photoWidth, height: photoHeight }}
                />
              ))}
            </ScrollView>
            {report.photos.length > 1 && (
              // White on a dark veil reads over any photo. Says there is more to swipe to.
              <Text
                aria-label={`Photo ${photoIndex + 1} of ${report.photos.length}`}
                style={styles.counter}>
                {photoIndex + 1} / {report.photos.length}
              </Text>
            )}
          </View>
        )}

        <View style={styles.body}>
          {/* What it is, how urgent, how far, how long ago: the decision, before any detail. */}
          <View style={styles.summary}>
            <ThemedText role="heading" style={styles.animal}>
              {animal}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {formatDistance(report.distanceM)} away · Reported {formatAge(report.createdAt).toLowerCase()}
            </ThemedText>
            <View style={styles.chips}>
              <Chip variant="secondary" size="sm" color={URGENCY_CHIP[report.urgency]}>
                {urgency}
              </Chip>
              {isResponding && (
                <Chip variant="secondary" size="sm" color="success">
                  Someone is on the way
                </Chip>
              )}
              {isMine && (
                <Chip variant="secondary" size="sm" color="accent">
                  Your report
                </Chip>
              )}
            </View>
          </View>

          {/* The photo and the summary stay put; only what is under them changes. */}
          <Tabs
            aria-label="What to show"
            value={tab}
            onValueChange={(value) => setTab(value === 'reporter' ? 'reporter' : 'report')}>
            <Tabs.List className="self-stretch">
              <Tabs.Indicator />
              <Tabs.Trigger value="report" className="flex-1">
                <Tabs.Label>Report</Tabs.Label>
              </Tabs.Trigger>
              <Tabs.Trigger value="reporter" className="flex-1">
                <Tabs.Label>Reporter</Tabs.Label>
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs>

          {tab === 'report' ? (
            <>
              {/* The streets first, then the words that pick the spot out, then how far to trust it. */}
              <Section title="Where">
                <ReportPlaceMap
                  latitude={report.latitude}
                  longitude={report.longitude}
                  urgency={report.urgency}
                />
                {(report.landmark || report.accuracyM != null) && (
                  <View style={styles.place}>
                    {report.landmark && <ThemedText style={styles.landmark}>{report.landmark}</ThemedText>}
                    {report.accuracyM != null && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Location accurate to about {Math.round(report.accuracyM)} m.
                      </ThemedText>
                    )}
                  </View>
                )}
              </Section>

              <Section title="About the animal">
                {/* How urgent, in the reporter's own choice of words, with what that choice means. */}
                <View style={styles.urgency}>
                  <View
                    style={[styles.urgencyDot, { backgroundColor: URGENCY_COLORS[report.urgency] }]}
                  />
                  <View style={styles.urgencyText}>
                    <ThemedText style={styles.urgencyLabel}>{urgency}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {URGENCIES.find((option) => option.value === report.urgency)?.hint}
                    </ThemedText>
                  </View>
                </View>

                {/* Two to a line, so four facts take two short rows instead of a long table. */}
                <View style={styles.traits}>
                  {details.map((detail, index) => (
                    <Trait
                      key={detail.label}
                      label={detail.label}
                      value={detail.value}
                      isRight={index % 2 === 1}
                      isFirstLine={index < 2}
                    />
                  ))}
                </View>
              </Section>
            </>
          ) : (
            <Reporter reporter={reporter} isMine={isMine} />
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

type ReporterProfile = {
  name: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  /** How many reports this person has sent, of any status. `null` when it could not be counted. */
  reportCount: number | null;
};

/**
 * The profile of whoever sent the report. `undefined` while it is being read, `null` when it could
 * not be. Every signed-in user may read profiles and reports; the database's own rules allow it.
 */
function useReporter(reporterId: string | undefined) {
  const [reporter, setReporter] = useState<ReporterProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!reporterId) return;
    let isGone = false;
    Promise.all([
      supabase
        .from('profiles')
        .select('display_name, avatar_url, created_at')
        .eq('id', reporterId)
        .maybeSingle(),
      // Counted by the database; no report rows are sent to the phone.
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_id', reporterId),
    ]).then(([profile, sent]) => {
      if (isGone) return;
      if (profile.error) console.warn('Reading the reporter failed:', profile.error);
      setReporter(
        profile.data
          ? {
              name: profile.data.display_name,
              avatarUrl: profile.data.avatar_url,
              joinedAt: profile.data.created_at,
              reportCount: sent.error ? null : sent.count,
            }
          : null
      );
    });
    return () => {
      isGone = true;
    };
  }, [reporterId]);

  return reporter;
}

/** Who sent the report: a face or initials, a name, and two facts that say how known they are here. */
function Reporter({
  reporter,
  isMine,
}: {
  reporter: ReporterProfile | null | undefined;
  isMine: boolean;
}) {
  const accent = useThemeColor('accent');

  if (reporter === null) {
    return (
      <ThemedText role="alert" themeColor="textSecondary">
        Could not load who reported this. Check your connection and open the report again.
      </ThemedText>
    );
  }

  if (!reporter) {
    return (
      <View accessible aria-busy aria-label="Loading who reported this" style={styles.reporter}>
        <Skeleton className="h-16 w-16 rounded-full" />
        <View style={styles.reporterText}>
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </View>
      </View>
    );
  }

  // A guest who never set a name has none. Google users bring theirs from Google.
  const hasName = !!reporter.name?.trim();
  const name = reporter.name?.trim() || 'Guest';
  const joined = new Date(reporter.joinedAt).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.reporterPanel}>
      <View style={styles.reporter}>
        <Avatar alt={name} size="lg" color="accent" variant="soft">
          {reporter.avatarUrl && <Avatar.Image source={{ uri: reporter.avatarUrl }} />}
          <Avatar.Fallback>
            {hasName ? initialsOf(name) : <HugeiconsIcon icon={UserIcon} size={28} color={accent} />}
          </Avatar.Fallback>
        </Avatar>
        <View style={styles.reporterText}>
          <ThemedText style={styles.reporterName} numberOfLines={2}>
            {name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {isMine ? 'This is you' : 'Sent this report'}
          </ThemedText>
        </View>
      </View>

      <Section title="On PawPin">
        <View style={styles.traits}>
          <Trait label="Joined" value={joined} />
          {reporter.reportCount != null && (
            <Trait label="Reports sent" value={String(reporter.reportCount)} isRight />
          )}
        </View>
      </Section>
    </View>
  );
}

/** A titled group. Set apart by space and a line above it, not by a box. */
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const border = useThemeColor('border');
  return (
    <View style={[styles.section, { borderTopColor: border }]}>
      <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

/** One fact: a small label over its value. Half the width, so two sit on a line. */
function Trait({
  label,
  value,
  isRight = false,
  isFirstLine = true,
}: {
  label: string;
  value: string;
  /** The second of a pair: set off from the first by a line down its left side. */
  isRight?: boolean;
  /** Lines after the first get a line across their top. */
  isFirstLine?: boolean;
}) {
  const border = useThemeColor('border');
  return (
    <View
      style={[
        styles.trait,
        isRight && styles.traitRight,
        !isFirstLine && styles.traitBelow,
        { borderColor: border },
      ]}>
      <ThemedText themeColor="textSecondary" style={styles.traitLabel}>
        {label}
      </ThemedText>
      <ThemedText style={styles.traitValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  // Centered on a wide screen, where the photo stops growing at the column's width.
  photos: {
    alignSelf: 'center',
  },
  counter: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  // Same column and side margin as the tabs. Groups sit further apart than the lines inside them.
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  summary: {
    gap: Spacing.one,
  },
  // The one large line on the page.
  animal: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reporterPanel: {
    gap: Spacing.four,
  },
  reporter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  reporterText: {
    flex: 1,
    gap: Spacing.half,
  },
  // Same size as the name on the Profile tab.
  reporterName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
  place: {
    gap: Spacing.half,
    marginTop: Spacing.one,
  },
  // What a rescuer looks for on arrival, so it carries a little more weight than body text.
  landmark: {
    fontWeight: 600,
  },
  urgency: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  // The pin's color, as on the Map. Nudged down to sit beside the first line of text.
  urgencyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    // The white edge keeps the dot visible on a dark page, as on the dark map.
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  urgencyText: {
    flex: 1,
    gap: Spacing.half,
  },
  urgencyLabel: {
    fontWeight: 600,
  },
  // Two equal columns that wrap onto further lines. A long typed value wraps inside its column.
  traits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.one,
  },
  trait: {
    width: '50%',
    gap: Spacing.half,
    paddingVertical: Spacing.two + Spacing.half,
    paddingRight: Spacing.three,
  },
  traitRight: {
    paddingLeft: Spacing.three,
    paddingRight: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  traitBelow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  traitLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  traitValue: {
    fontWeight: 600,
  },
});
