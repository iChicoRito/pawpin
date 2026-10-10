import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import FirstAidKitIcon from '@hugeicons/core-free-icons/FirstAidKitIcon';
import Flag02Icon from '@hugeicons/core-free-icons/Flag02Icon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import PaintBoardIcon from '@hugeicons/core-free-icons/PaintBoardIcon';
import PawPrintIcon from '@hugeicons/core-free-icons/PawPrintIcon';
import RulerIcon from '@hugeicons/core-free-icons/RulerIcon';
import SearchRemoveIcon from '@hugeicons/core-free-icons/SearchRemoveIcon';
import Undo02Icon from '@hugeicons/core-free-icons/Undo02Icon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { BlurTargetView } from 'expo-blur';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  ListGroup,
  Menu,
  Separator,
  Skeleton,
  Spinner,
  Tabs,
  useThemeColor,
  useToast,
  type MenuTriggerRef,
} from 'heroui-native';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { svg as googleMapsLogo } from 'thesvg/google-maps';
import { svg as wazeLogo } from 'thesvg/waze';

import { BrandIcon } from '@/components/brand-icon';
import { AppDialogOverlay, PageVeil } from '@/components/drawer-backdrop';
import { GoogleSignInDialog } from '@/components/google-sign-in-dialog';
import { URGENCY_CHIP } from '@/components/report-card';
import { ReportPlaceMap } from '@/components/report-place-map';
import { ToastIcon } from '@/components/report-sent';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDirections } from '@/hooks/use-directions';
import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { adminCloseReport, fetchReportFlags } from '@/lib/admin';
import { cancelClaim, claimReport, closeReport, refusalOf, resolveReport } from '@/lib/claims';
import {
  FLAG_REASONS,
  flagReport,
  isAlreadyFlagged,
  isGuestFlagLimit,
  type FlagReason,
} from '@/lib/flags';
import { formatAge, formatDistance, initialsOf } from '@/lib/format';
import { fetchReport, URGENCY_COLORS, type NearbyReport, type ReportDetail } from '@/lib/nearby';
import {
  ANIMAL_TYPES,
  COLORS,
  CONDITIONS,
  labelFor,
  REPORT_STATUSES,
  SIZES,
  URGENCIES,
  type ReportPlace,
} from '@/lib/reports';
import { supabase } from '@/lib/supabase';

/** The photo is as wide as the screen and three quarters as tall, up to this height. */
const PHOTO_MAX_HEIGHT = 360;

/** What is asked before a status change is sent. The button repeats the action. */
const CONFIRMATIONS = {
  // The reporter's two ways to end their own report.
  close_rescued: {
    title: 'Close as rescued?',
    description:
      'The report ends as rescued, in your name, and leaves the map for everyone. It cannot be undone.',
    confirm: 'Mark as rescued',
    isDanger: false,
  },
  // The admin's own: someone else's report, taken down because it is fake, wrong, or abusive.
  admin_close: {
    title: 'Close this report?',
    description:
      'It ends as closed and leaves the map for everyone. The reporter is not alerted. It cannot be opened again.',
    confirm: 'Close report',
    isDanger: true,
  },
  close: {
    title: 'Close this report?',
    description:
      'It ends without a rescue and leaves the map for everyone. It cannot be opened again.',
    confirm: 'Close report',
    isDanger: true,
  },
  rescued: {
    title: 'Mark as rescued?',
    description: 'This ends the report and takes it off the map for everyone. It cannot be undone.',
    confirm: 'Mark as rescued',
    isDanger: false,
  },
  not_found: {
    title: 'Mark as not found?',
    // The animal may still be out there, and after this nobody else is sent to look.
    description:
      'This ends the report without a rescue. It leaves the map and no one else will be sent to look. It cannot be undone.',
    confirm: 'Mark as not found',
    isDanger: true,
  },
  cancel: {
    title: 'Can’t make it?',
    description: 'The report opens again, so another rescuer can take it.',
    confirm: 'I can’t make it',
    isDanger: false,
  },
  // Not a status change, but asked the same way: a flag cannot be taken back either.
  flag: {
    title: 'Flag this report?',
    description: 'An admin will look at it. The reporter is not told who flagged it.',
    confirm: 'Flag report',
    isDanger: false,
  },
} as const;

/** One report in full: what a rescuer reads before deciding to go. */
export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { reports, place, reload } = useNearbyReports();
  const { session, isGuest, isAdmin } = useSession();
  const { toast } = useToast();
  // Which rescue button is waiting for the database. The others are held until it answers.
  const [busy, setBusy] = useState<
    | 'claim'
    | 'cancel'
    | 'rescued'
    | 'not_found'
    | 'close'
    | 'close_rescued'
    | 'admin_close'
    | 'flag'
    | null
  >(null);
  // What the viewer said is wrong with the report, kept until they confirm the flag.
  const [flagReason, setFlagReason] = useState<FlagReason>(FLAG_REASONS[0]);
  // Only for as long as this page is open: a flag cannot be read back, so it is not known later.
  const [hasFlagged, setHasFlagged] = useState(false);
  // Whether the flag drawer is up, as the drawer itself reports it. Opened through this trigger.
  const [isFlagOpen, setIsFlagOpen] = useState(false);
  const flagTrigger = useRef<MenuTriggerRef>(null);
  // Which drawer at the foot of the page is up, if any. The page is blurred and dimmed behind a
  // drawer only while that one is up: a drawer's parts stay mounted when it is closed, unlike the
  // dialog's, and two of these drawers can be on the page at once.
  const [openSheet, setOpenSheet] = useState<'close' | 'directions' | 'status' | null>(null);
  // The Google sign-in, and why it is being asked for: to go to an animal, or to flag more.
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [signInFor, setSignInFor] = useState<'claim' | 'flags'>('claim');
  // The status change waiting for a yes. Kept after the dialog closes, so its words do not vanish
  // while it fades out.
  const [pending, setPending] = useState<keyof typeof CONFIRMATIONS>('rescued');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // The page itself, so the dialog can blur it. On Android a blur has to be told what is behind it.
  const page = useRef<View>(null);
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
  const [photoIndex, setPhotoIndex] = useState(0);
  // The photos that have been drawn. The one in view shows a skeleton until it is among them.
  const [loadedPhotos, setLoadedPhotos] = useState<string[]>([]);
  const [tab, setTab] = useState<'report' | 'reporter'>('report');
  // Read from the reports the Map and the List already hold, when it is among them. A report
  // opened from an alert may be outside the search distance, or finished: that one is fetched.
  const nearby = reports.find((candidate) => candidate.id === id);
  const fetched = useFetchedReport(id, !!nearby, reports, place);
  // `undefined` while it is being read, `null` when there is no such report.
  const report: ReportDetail | null | undefined = nearby ?? fetched.report;

  const reporter = useReporter(report?.reporterId);
  // Only an admin can read flags, so only an admin asks.
  const flags = useReportFlags(isAdmin ? report?.id : undefined);
  const directions = useDirections(report ?? undefined);
  const [muted, foreground] = useThemeColor(['muted', 'foreground']);

  if (!report) {
    // Still reading. Said in words too, for someone who cannot see the spinner.
    if (report === undefined && !fetched.failed) {
      return (
        <ThemedView style={[styles.container, styles.missing]}>
          <Spinner />
          <ThemedText type="small" themeColor="textSecondary" aria-live="polite">
            Loading report…
          </ThemedText>
        </ThemedView>
      );
    }
    return (
      <ThemedView style={[styles.container, styles.missing]}>
        <ThemedText role="alert" style={styles.centered}>
          {report === null
            ? 'This report is no longer available.'
            : 'Could not load this report. Check your connection and try again.'}
        </ThemedText>
        <View style={styles.missingChoices}>
          <Button variant="secondary" onPress={() => router.back()}>
            Back
          </Button>
          {report === undefined && <Button onPress={fetched.again}>Try again</Button>}
        </View>
      </ThemedView>
    );
  }

  const animal = labelFor(ANIMAL_TYPES, report.animalType) || 'Animal';
  const urgency = labelFor(URGENCIES, report.urgency);
  const isMine = report.reporterId === session?.user.id;
  const isResponding = report.status === 'responding';
  // Rescued, not found, or closed: there is nothing left to do here but read.
  const hasEnded = report.status !== 'reported' && !isResponding;
  const isMyClaim = isResponding && report.rescuerId === session?.user.id;
  const photoWidth = Math.min(window.width, MaxContentWidth);
  const photoHeight = Math.min(photoWidth * 0.75, PHOTO_MAX_HEIGHT);

  /** Sends one rescue action, then shows what the database now holds. */
  async function act(kind: NonNullable<typeof busy>, send: () => Promise<void>) {
    setBusy(kind);
    try {
      await send();
      if (kind !== 'claim' && kind !== 'cancel') {
        toast.show({
          variant: 'success',
          icon: <ToastIcon status="success" />,
          label:
            kind === 'close' || kind === 'admin_close'
              ? 'Report closed'
              : kind === 'not_found'
                ? 'Marked as not found'
                : 'Marked as rescued',
          description: 'The report has left the map.',
        });
        // Leave first: once ended, the report is no longer among the nearby ones.
        router.back();
      }
      await reload();
      // A report that is not among the nearby ones is not touched by that search.
      fetched.again();
    } catch (error) {
      const refusal = refusalOf(error);
      if (!refusal) console.warn('Rescue action failed:', error);
      toast.show({
        variant: 'danger',
        icon: <ToastIcon status="danger" />,
        label:
          refusal === 'report_not_open'
            ? 'Someone else is already on the way'
            : refusal === 'already_on_the_way'
              ? 'You are already on the way to another animal'
              : refusal === 'cannot_close'
                ? 'This report has already ended'
                : refusal === 'own_report'
                  ? 'This is your own report'
                  : refusal === 'no_active_claim'
                    ? 'This report has changed'
                    : 'Could not send',
        description:
          refusal === 'already_on_the_way'
            ? 'Finish that rescue or give it up first. Open it and tap Update status.'
            : refusal === 'own_report'
              ? 'If you helped the animal yourself, close the report and say so.'
              : refusal
                ? 'This page now shows the latest.'
                : 'Check your connection and try again.',
      });
      if (refusal) {
        await reload();
        fetched.again();
      }
    } finally {
      setBusy(null);
    }
  }

  function openSignIn(why: typeof signInFor) {
    setSignInFor(why);
    setIsSignInOpen(true);
  }

  function askFirst(kind: keyof typeof CONFIRMATIONS) {
    setPending(kind);
    setIsConfirmOpen(true);
  }

  /** Sends the flag. Apart from the rescue actions: it changes nothing anyone else can see. */
  async function sendFlag(reportId: string) {
    const userId = session?.user.id;
    if (!userId) return;
    setBusy('flag');
    try {
      await flagReport(reportId, userId, flagReason);
      setHasFlagged(true);
      toast.show({
        variant: 'success',
        icon: <ToastIcon status="success" />,
        label: 'Report flagged',
        description: 'Thanks. An admin will look at this report.',
      });
    } catch (error) {
      // A guest past their 3 flags for the day is not shown an error: they are shown the way on.
      if (isGuestFlagLimit(error)) {
        openSignIn('flags');
        return;
      }
      const isRepeat = isAlreadyFlagged(error);
      if (isRepeat) setHasFlagged(true);
      else console.warn('Flagging the report failed:', error);
      toast.show({
        variant: 'danger',
        icon: <ToastIcon status="danger" />,
        label: isRepeat ? 'You already flagged this report' : 'Could not send',
        description: isRepeat
          ? 'An admin will look at it.'
          : 'Check your connection and try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  function confirm() {
    setIsConfirmOpen(false);
    if (!report) return;
    const reportId = report.id;
    if (pending === 'flag') {
      sendFlag(reportId);
      return;
    }
    act(pending, () =>
      pending === 'admin_close'
        ? adminCloseReport(reportId)
        : pending === 'close' || pending === 'close_rescued'
          ? closeReport(reportId, pending === 'close_rescued')
          : pending === 'cancel'
            ? cancelClaim(reportId)
            : resolveReport(reportId, pending),
    );
  }

  // Only what the reporter gave. A report sent with the required answers alone shows no empty rows.
  const details = [
    { icon: PawPrintIcon, label: 'Animal', value: animal },
    { icon: FirstAidKitIcon, label: 'Condition', value: labelFor(CONDITIONS, report.condition) },
    { icon: RulerIcon, label: 'Size', value: labelFor(SIZES, report.size) },
    { icon: PaintBoardIcon, label: 'Color', value: labelFor(COLORS, report.color) },
  ].filter((detail) => detail.value);

  return (
    <ThemedView style={styles.container}>
      {/* The flag sits in the header, away from the two buttons at the foot of the page: it is for
          the rare report that is fake or abusive, not a step in a rescue. Not on the viewer's own
          report, which they can close instead, not on a finished one, and not for an admin, who
          is the one flags are sent to. */}
      <Stack.Screen
        options={{
          headerRight:
            !hasEnded && !isMine && !isAdmin
              ? () => (
                  <Pressable
                    role="button"
                    aria-label={hasFlagged ? 'Report flagged' : 'Flag this report'}
                    disabled={busy !== null || hasFlagged}
                    hitSlop={12}
                    onPress={() => flagTrigger.current?.open()}
                    style={({ pressed }) => [
                      styles.headerAction,
                      (pressed || hasFlagged) && styles.headerActionQuiet,
                    ]}>
                    <HugeiconsIcon icon={Flag02Icon} size={22} color={foreground} />
                  </Pressable>
                )
              : undefined,
        }}
      />
      <BlurTargetView ref={page} style={styles.container}>
        {/* The page scrolls above the buttons, which stay put. The color is for the blur: it copies
            only what the views in here draw, and the blur target does not draw a color of its own.
            Without one on the scroll view, every empty part of the page comes out black. */}
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
          {/* The photo leads: edge to edge, no frame, because recognising the animal comes first. */}
          {report.photos.length > 0 && (
            <View style={[styles.photos, { width: photoWidth, height: photoHeight }]}>
              {/* Under the photos, so a photo covers it as soon as it is drawn. */}
              {!loadedPhotos.includes(report.photos[photoIndex]) && (
                <Skeleton className="absolute inset-0 rounded-none" />
              )}
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEnabled={report.photos.length > 1}
                onMomentumScrollEnd={(event) =>
                  setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / photoWidth))
                }>
                {report.photos.map((uri, index) => (
                  // To look at, not to press: the photo is already as wide as the screen here.
                  <Image
                    key={uri}
                    source={{ uri }}
                    accessible
                    role="img"
                    aria-label={`Photo ${index + 1} of ${report.photos.length}`}
                    onLoad={() => setLoadedPhotos((loaded) => [...loaded, uri])}
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
              <View style={styles.summaryText}>
                <ThemedText role="heading" style={styles.animal}>
                  {animal}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.regular}>
                  {/* No distance when the phone's place is not known yet. */}
                  {report.distanceM !== null && `${formatDistance(report.distanceM)} away · `}
                  Reported {formatAge(report.createdAt).toLowerCase()}
                </ThemedText>
                {isMine && (
                  // As wide as its words, not the column.
                  <Chip variant="primary" size="sm" color="accent" className="mt-1 self-start">
                    Your report
                  </Chip>
                )}
              </View>
              <View style={styles.chips}>
                <Chip variant="secondary" size="sm" color={URGENCY_CHIP[report.urgency]}>
                  {urgency}
                </Chip>
                {isResponding && (
                  <Chip variant="secondary" size="sm" color="success">
                    {isMyClaim ? 'You are on the way' : 'Someone is on the way'}
                  </Chip>
                )}
                {/* How it ended. Green only for a rescue. */}
                {hasEnded && (
                  <Chip
                    variant="secondary"
                    size="sm"
                    color={report.status === 'rescued' ? 'success' : 'default'}>
                    {labelFor(REPORT_STATUSES, report.status)}
                  </Chip>
                )}
              </View>
            </View>

            {/* For an admin only, and first under the summary: what users said is wrong with this
                report is what they came to read. Who said it is not read. Above the tabs, so it
                shows on both. */}
            {flags.length > 0 && (
              <Section
                title={flags.length === 1 ? 'Flagged once' : `Flagged ${flags.length} times`}>
                <ListGroup>
                  {flags.map((flag, index) => (
                    <Fragment key={index}>
                      {index > 0 && <Separator className="mx-4" />}
                      <Trait
                        icon={Flag02Icon}
                        label={flag.reason}
                        value={formatAge(flag.createdAt)}
                      />
                    </Fragment>
                  ))}
                </ListGroup>
              </Section>
            )}

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
                {/* The streets first, then the words that pick the spot out. */}
                <Section title="Where">
                  <ReportPlaceMap
                    latitude={report.latitude}
                    longitude={report.longitude}
                    urgency={report.urgency}
                  />
                  {report.landmark && (
                    <View style={styles.place}>
                      <ThemedText style={styles.landmark}>{report.landmark}</ThemedText>
                    </View>
                  )}
                </Section>

                <Section title="About the animal">
                  {/* How urgent, in the reporter's own choice of words, with what that choice means. */}
                  <ThemedView type="backgroundElement" style={[styles.tile, styles.urgency]}>
                    <View
                      style={[
                        styles.urgencyDot,
                        { backgroundColor: URGENCY_COLORS[report.urgency] },
                      ]}
                    />
                    <View style={styles.urgencyText}>
                      <ThemedText style={styles.urgencyLabel}>{urgency}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
                        {URGENCIES.find((option) => option.value === report.urgency)?.hint}
                      </ThemedText>
                    </View>
                  </ThemedView>

                  {/* One row per fact, in the same grouped list as the List tab and Settings. */}
                  <ListGroup>
                    {details.map((detail, index) => (
                      <Fragment key={detail.label}>
                        {index > 0 && <Separator className="mx-4" />}
                        <Trait icon={detail.icon} label={detail.label} value={detail.value} />
                      </Fragment>
                    ))}
                  </ListGroup>
                </Section>
              </>
            ) : (
              <Reporter reporter={reporter} isMine={isMine} />
            )}
          </View>

          {/* The last thing on the page, after everything a rescuer reads before deciding. It
              scrolls with the page and is not held over it. A finished report has no buttons:
              only the room they would have taken, so the page does not end against the edge. */}
          <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.four }]}>
            {/* For the rescuer who is going, for as long as they are: a toast would be gone before
                they got there. Quiet, above the two buttons, so it is not taken for a third. */}
            {isMyClaim && (
              <Button variant="tertiary" size="sm" onPress={() => router.push('/safety')}>
                Read the safety tips
              </Button>
            )}
            {/* One line, two buttons at most: how to get there, and the one thing to do next. */}
            {!hasEnded && (
              <View style={styles.actionsRow}>
                {isMine ? (
                  // The reporter was there and needs no route. What only they can do is end the
                  // report, and say how it ended. It fills the bar: there is nothing else to do here.
                  <Menu
                    presentation="bottom-sheet"
                    onOpenChange={(open) => setOpenSheet(open ? 'close' : null)}
                    style={!isMyClaim && styles.mainAction}>
                    <Menu.Trigger asChild>
                      <Button variant="danger-soft" isDisabled={busy !== null}>
                        {busy === 'close' || busy === 'close_rescued' ? 'Closing…' : 'Close report'}
                      </Button>
                    </Menu.Trigger>
                    <Menu.Portal>
                      {openSheet === 'close' && <PageVeil page={page} isDark={isDark} />}
                      <Menu.Overlay />
                      <Menu.Content presentation="bottom-sheet">
                        <Menu.Label>Why are you closing it?</Menu.Label>
                        <Menu.Item
                          style={styles.sheetRow}
                          onPress={() => askFirst('close_rescued')}>
                          <ChoiceIcon icon={CheckmarkCircle02Icon} />
                          <View style={styles.sheetText}>
                            <Menu.ItemTitle>I helped it myself</Menu.ItemTitle>
                            <Menu.ItemDescription>
                              The animal is safe or with a vet. Ends as rescued.
                            </Menu.ItemDescription>
                          </View>
                        </Menu.Item>
                        <Menu.Item style={styles.sheetRow} onPress={() => askFirst('close')}>
                          <ChoiceIcon icon={CancelCircleIcon} />
                          <View style={styles.sheetText}>
                            <Menu.ItemTitle>It no longer needs help</Menu.ItemTitle>
                            <Menu.ItemDescription>
                              It left, or someone took it in. Ends as closed.
                            </Menu.ItemDescription>
                          </View>
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu>
                ) : (
                  <>
                    {/* Must be the same word as on Menu.Content below, or HeroUI throws. The Menu is a
                view around its button, so it is the Menu that takes its share of the line. */}
                    <Menu
                      presentation="bottom-sheet"
                      onOpenChange={(open) => setOpenSheet(open ? 'directions' : null)}
                      style={isResponding && !isMyClaim && !isAdmin && styles.mainAction}>
                      <Menu.Trigger asChild>
                        {/* Filled only when it is the sole button: someone else is already going. */}
                        <Button
                          variant={
                            isResponding && !isMyClaim && !isAdmin ? 'primary' : 'secondary'
                          }>
                          Directions
                        </Button>
                      </Menu.Trigger>
                      <Menu.Portal>
                        {openSheet === 'directions' && <PageVeil page={page} isDark={isDark} />}
                        <Menu.Overlay />
                        <Menu.Content presentation="bottom-sheet">
                          <Menu.Label>Open directions in</Menu.Label>
                          {/* Each app by its own logo. The arrow says the tap leaves PawPin. */}
                          <Menu.Item style={styles.sheetRow} onPress={directions.openGoogleMaps}>
                            <BrandIcon xml={googleMapsLogo} />
                            <Menu.ItemTitle>Google Maps</Menu.ItemTitle>
                            <HugeiconsIcon icon={ArrowUpRight01Icon} size={18} color={muted} />
                          </Menu.Item>
                          <Menu.Item style={styles.sheetRow} onPress={directions.openWaze}>
                            <BrandIcon xml={wazeLogo} />
                            <Menu.ItemTitle>Waze</Menu.ItemTitle>
                            <HugeiconsIcon icon={ArrowUpRight01Icon} size={18} color={muted} />
                          </Menu.Item>
                        </Menu.Content>
                      </Menu.Portal>
                    </Menu>
                  </>
                )}

                {/* An admin does not go to animals. What only they can do is take a bad report
                    down, whoever sent it and whoever is on the way. */}
                {isAdmin && !isMine && !isMyClaim && (
                  <Button
                    variant="danger-soft"
                    style={styles.mainAction}
                    isDisabled={busy !== null}
                    onPress={() => askFirst('admin_close')}>
                    {busy === 'admin_close' ? 'Closing…' : 'Close report'}
                  </Button>
                )}

                {!isResponding && !isMine && !isAdmin && (
                  <Button
                    style={styles.mainAction}
                    isDisabled={busy !== null}
                    // A guest sees the same button and learns why it needs a Google account.
                    onPress={() =>
                      isGuest ? openSignIn('claim') : act('claim', () => claimReport(report.id))
                    }>
                    {busy === 'claim' ? 'Sending…' : 'I’m on my way'}
                  </Button>
                )}

                {/* The outcomes cannot be undone, so they take a second, deliberate tap. */}
                {isMyClaim && (
                  <Menu
                    presentation="bottom-sheet"
                    onOpenChange={(open) => setOpenSheet(open ? 'status' : null)}
                    style={styles.mainAction}>
                    <Menu.Trigger asChild>
                      <Button isDisabled={busy !== null}>
                        {busy === 'rescued' || busy === 'not_found' || busy === 'cancel'
                          ? 'Sending…'
                          : 'Update status'}
                      </Button>
                    </Menu.Trigger>
                    <Menu.Portal>
                      {openSheet === 'status' && <PageVeil page={page} isDark={isDark} />}
                      <Menu.Overlay />
                      <Menu.Content presentation="bottom-sheet">
                        <Menu.Label>What happened?</Menu.Label>
                        {/* The two ways it can end. Green marks the good one; shape tells them apart too. */}
                        <Menu.Item style={styles.sheetRow} onPress={() => askFirst('rescued')}>
                          <ChoiceIcon icon={CheckmarkCircle02Icon} />
                          <View style={styles.sheetText}>
                            <Menu.ItemTitle>Rescued</Menu.ItemTitle>
                            <Menu.ItemDescription>
                              The animal is safe or with a vet.
                            </Menu.ItemDescription>
                          </View>
                        </Menu.Item>
                        <Menu.Item
                          variant="danger"
                          style={styles.sheetRow}
                          onPress={() => askFirst('not_found')}>
                          <ChoiceIcon icon={SearchRemoveIcon} />
                          <View style={styles.sheetText}>
                            <Menu.ItemTitle>Not found</Menu.ItemTitle>
                            <Menu.ItemDescription>
                              You got there and the animal was gone.
                            </Menu.ItemDescription>
                          </View>
                        </Menu.Item>
                        {/* Not an outcome: it hands the report back. Set apart so it is not picked as one. */}
                        <Separator className="mx-3 my-1" />
                        <Menu.Item style={styles.sheetRow} onPress={() => askFirst('cancel')}>
                          <ChoiceIcon icon={Undo02Icon} />
                          <View style={styles.sheetText}>
                            <Menu.ItemTitle>I can’t make it</Menu.ItemTitle>
                            <Menu.ItemDescription>
                              Another rescuer can take this report.
                            </Menu.ItemDescription>
                          </View>
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </BlurTargetView>

      {/* What is wrong with the report. Opened by the flag in the header, through a trigger that is
          on the page but takes no room and cannot be seen, pressed, or read out.
          Not by handing the drawer `isOpen`: HeroUI then misses a drawer that is swiped down. It
          tells the page only when the new value differs from the one it remembers, and the swipe
          remembers the value from before the drawer opened. The page went on thinking the drawer
          was up, kept its blur, and the next tap landed on the unseen overlay. */}
      <Menu presentation="bottom-sheet" onOpenChange={setIsFlagOpen}>
        <Menu.Trigger
          ref={flagTrigger}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          tabIndex={-1}
          pointerEvents="none"
          style={styles.unseenTrigger}
        />
        <Menu.Portal>
          {isFlagOpen && <PageVeil page={page} isDark={isDark} />}
          <Menu.Overlay />
          <Menu.Content presentation="bottom-sheet">
            <Menu.Label>What is wrong with this report?</Menu.Label>
            {FLAG_REASONS.map((reason) => (
              <Menu.Item
                key={reason}
                style={styles.sheetRow}
                onPress={() => {
                  setFlagReason(reason);
                  askFirst('flag');
                }}>
                <Menu.ItemTitle>{reason}</Menu.ItemTitle>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu>

      {/* A status change is seen by everyone, and an outcome cannot be undone: ask once. */}
      <Dialog isOpen={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <Dialog.Portal>
          <AppDialogOverlay page={page} isDark={isDark} />
          <Dialog.Content>
            <Dialog.Title>{CONFIRMATIONS[pending].title}</Dialog.Title>
            <Dialog.Description>
              {CONFIRMATIONS[pending].description}
              {/* The reporter should know a rescuer is already going before they take it down. */}
              {(pending === 'close' || pending === 'close_rescued' || pending === 'admin_close') &&
                isResponding &&
                !isMyClaim &&
                ' Someone is on the way to this animal; closing tells them to stop.'}
            </Dialog.Description>
            <View style={styles.confirmChoices}>
              {/* Quieter beside the red button, so the two do not compete. */}
              <Button
                variant={CONFIRMATIONS[pending].isDanger ? 'tertiary' : 'secondary'}
                onPress={() => setIsConfirmOpen(false)}>
                Go back
              </Button>
              <Button
                variant={CONFIRMATIONS[pending].isDanger ? 'danger' : 'primary'}
                onPress={confirm}>
                {CONFIRMATIONS[pending].confirm}
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <GoogleSignInDialog
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        {...(signInFor === 'flags' && {
          title: 'Sign in to flag more',
          description:
            'Guests can flag 3 reports in 24 hours. Sign in with Google to flag this one; your reports stay yours.',
        })}
      />
    </ThemedView>
  );
}

/**
 * A report read by its id, for when it is not among the nearby ones: `skip` says it is. Read again
 * each time the nearby reports change, which is what a live change does, so a claim or an outcome
 * shows here too, with no loading state.
 */
function useFetchedReport(
  id: string,
  skip: boolean,
  reports: NearbyReport[],
  place: ReportPlace | null,
) {
  // Kept with its id, so one report's answer is never shown as another's.
  const [answer, setAnswer] = useState<{ id: string; report: ReportDetail | null }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (skip || !id) return;
    let isGone = false;
    fetchReport(id, place)
      .then((report) => {
        if (isGone) return;
        setAnswer({ id, report });
        setFailed(false);
      })
      .catch((error) => {
        console.warn('Loading the report failed:', error);
        if (!isGone) setFailed(true);
      });
    return () => {
      isGone = true;
    };
    // Not on a new place alone: the distance shown is from where the viewer last searched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, skip, reports, attempt]);

  const report = answer?.id === id ? answer.report : undefined;
  return {
    report,
    // Only while there is nothing to show. A quiet read that fails leaves the page as it was.
    failed: failed && report === undefined,
    again: () => {
      setFailed(false);
      setAttempt((count) => count + 1);
    },
  };
}

/**
 * The flags on a report, newest first, for an admin. Empty for everyone else, while it is being
 * read, and when it cannot be: the section is then simply not there.
 */
function useReportFlags(reportId: string | undefined) {
  const [answer, setAnswer] = useState<{
    id: string;
    flags: { reason: string; createdAt: string }[];
  }>();

  useEffect(() => {
    if (!reportId) return;
    let isGone = false;
    fetchReportFlags(reportId)
      .then((flags) => {
        if (!isGone) setAnswer({ id: reportId, flags });
      })
      .catch((error) => console.warn('Reading the flags failed:', error));
    return () => {
      isGone = true;
    };
  }, [reportId]);

  return answer && answer.id === reportId ? answer.flags : [];
}

/** An icon on a faint tile. Same size as a `BrandIcon`, so both drawers line up. */
function ChoiceIcon({ icon }: { icon: IconSvgElement }) {
  // One neutral color for every choice. Which one is good or bad is said by its words, not by
  // green or red.
  const foreground = useThemeColor('foreground');
  return (
    <View aria-hidden style={styles.choiceIcon}>
      {/* Theme colors come in more than one notation, so the tint is a see-through layer. */}
      <View style={[StyleSheet.absoluteFill, styles.choiceTint, { backgroundColor: foreground }]} />
      <HugeiconsIcon icon={icon} size={22} color={foreground} />
    </View>
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
          : null,
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
            {hasName ? (
              initialsOf(name)
            ) : (
              <HugeiconsIcon icon={UserIcon} size={28} color={accent} />
            )}
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
        <ListGroup>
          <Trait icon={Calendar03Icon} label="Joined" value={joined} />
          {reporter.reportCount != null && (
            <>
              <Separator className="mx-4" />
              <Trait
                icon={Megaphone01Icon}
                label="Reports sent"
                value={String(reporter.reportCount)}
              />
            </>
          )}
        </ListGroup>
      </Section>
    </View>
  );
}

/** A titled group. Set apart by space and a line above it, not by a box. */
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const border = useThemeColor('border');
  return (
    <View style={[styles.section, { borderTopColor: border }]}>
      <ThemedText type="small" role="heading" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

/** One fact as a row of a grouped list: its icon and label at the start, its value at the end. */
function Trait({ icon, label, value }: { icon: IconSvgElement; label: string; value: string }) {
  const foreground = useThemeColor('foreground');
  return (
    // A row to read, not to press.
    <ListGroup.Item pointerEvents="none">
      <ListGroup.ItemPrefix>
        <HugeiconsIcon icon={icon} size={20} color={foreground} />
      </ListGroup.ItemPrefix>
      <ThemedText themeColor="textSecondary" style={styles.regular}>
        {label}
      </ThemedText>
      <ListGroup.ItemContent>
        <ThemedText style={styles.traitValue}>{value}</ThemedText>
      </ListGroup.ItemContent>
    </ListGroup.Item>
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
  missingChoices: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Set off from the last section by space alone, like the sections from each other.
  actions: {
    gap: Spacing.two,
    paddingTop: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  // Same column as the page above it.
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth - Spacing.four * 2,
    alignSelf: 'center',
  },
  // A row in either drawer: tall enough for a thumb, with room between it and the next.
  sheetRow: {
    minHeight: 56,
    gap: Spacing.three,
  },
  // Same place and order as the choices in the sign-in dialog. They wrap on a narrow phone.
  confirmChoices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTint: {
    opacity: 0.08,
  },
  // The flag in the header. Its touch area is widened by hitSlop to a thumb's size.
  headerAction: {
    padding: Spacing.one,
  },
  unseenTrigger: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  // Pressed, or already used.
  headerActionQuiet: {
    opacity: 0.4,
  },
  sheetText: {
    flex: 1,
    gap: Spacing.half,
  },
  // The main button takes the room that is left.
  mainAction: {
    flex: 1,
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
  // The words at the start, the chips at the end.
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  summaryText: {
    flex: 1,
    gap: Spacing.one,
  },
  regular: {
    fontWeight: 400,
  },
  // The one large line on the page.
  animal: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
  },
  // One under the other against the end. Nudged down to sit level with the animal's name.
  chips: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    marginTop: Spacing.one,
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
  // The filled box the urgency sits in.
  tile: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
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
  // At the end of the row. A long typed value wraps under itself, still against the end.
  traitValue: {
    fontWeight: 600,
    textAlign: 'right',
  },
});
