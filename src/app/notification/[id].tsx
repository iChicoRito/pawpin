import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, ListGroup, Skeleton, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useChatClaim } from '@/lib/messages';
import {
  animalIn,
  fetchNotification,
  markRead,
  NOTIFICATION_KINDS,
  type AppNotification,
} from '@/lib/notifications';
import { labelFor, REPORT_STATUSES } from '@/lib/reports';

const ICON_SIZE = 72;
const PHOTO_SIZE = 56;

/**
 * One notification in full: what happened, when, why if an admin said why, and the report it is
 * about. Opened from the list on the Profile tab and from a tapped alert. Opening it reads it.
 */
export default function NotificationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [success, danger, foreground, muted] = useThemeColor([
    'success',
    'danger',
    'foreground',
    'muted',
  ]);
  // Kept with its id, so one notification's answer is never shown as another's. `null`: no such one.
  const [answer, setAnswer] = useState<{ id: string; notification: AppNotification | null }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const notification = answer?.id === id ? answer.notification : undefined;
  // Only a message leads to a chat.
  const chat = useChatClaim(notification?.kind === 'message' ? notification.reportId : undefined);

  useEffect(() => {
    if (!id) return;
    let isGone = false;
    fetchNotification(id)
      .then((found) => {
        if (isGone) return;
        setAnswer({ id, notification: found });
        setFailed(false);
        if (found && !found.readAt) markRead(id);
      })
      .catch((error) => {
        console.warn('Loading the notification failed:', error);
        if (!isGone) setFailed(true);
      });
    return () => {
      isGone = true;
    };
  }, [id, attempt]);

  if (!notification) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {notification === undefined && !failed ? (
          <View accessible aria-busy aria-label="Loading notification" style={styles.skeleton}>
            <Skeleton className="h-18 w-18 rounded-full" />
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-4 w-64 rounded-md" />
          </View>
        ) : notification === null ? (
          <Notice
            icon={AlertCircleIcon}
            title="This notification is gone"
            text="The report it was about is no longer on PawPin."
            action="Back"
            onAction={() => router.back()}
          />
        ) : (
          <Notice
            icon={AlertCircleIcon}
            title="Could not load this notification"
            text="Check your connection and try again."
            action="Try again"
            onAction={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
            isAlert
          />
        )}
      </ThemedView>
    );
  }

  const kind = NOTIFICATION_KINDS[notification.kind];
  const animal = animalIn(notification);
  const tone = kind.tone === 'success' ? success : kind.tone === 'danger' ? danger : foreground;
  const when = new Date(notification.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const openReport = () =>
    router.push({ pathname: '/report/[id]', params: { id: notification.reportId } });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* What happened leads, in the middle: one icon, one line, when, then one sentence. */}
        <View style={styles.lead}>
          <View aria-hidden style={styles.icon}>
            {/* Theme colors come in more than one notation, so the tint is a see-through layer. */}
            <View style={[StyleSheet.absoluteFill, styles.iconTint, { backgroundColor: tone }]} />
            <HugeiconsIcon icon={kind.icon} size={34} color={tone} />
          </View>
          <View style={styles.leadText}>
            <ThemedText role="heading" style={styles.title}>
              {kind.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              {when}
            </ThemedText>
          </View>
          <ThemedText style={[styles.line, styles.centeredText]}>{kind.line(animal)}</ThemedText>
        </View>

        {/* Why, set apart: it is the one thing on this page the reporter could not have guessed. */}
        {notification.reason && (
          <Card variant="default" style={styles.reason}>
            <ThemedText type="small" themeColor="textSecondary">
              Reason
            </ThemedText>
            <ThemedText style={styles.reasonText}>{notification.reason}</ThemedText>
          </Card>
        )}

        <View style={styles.about}>
          <ThemedText type="small" role="heading" themeColor="textSecondary">
            The report
          </ThemedText>
          <ListGroup>
            <ListGroup.Item
              role="button"
              accessible
              aria-label={`${animal}, ${labelFor(REPORT_STATUSES, notification.status)}`}
              accessibilityHint="Opens the report"
              onPress={openReport}>
              <ListGroup.ItemPrefix>
                {notification.photo ? (
                  <Image source={{ uri: notification.photo }} style={styles.photo} />
                ) : (
                  <ThemedView type="backgroundSelected" style={styles.photo} />
                )}
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>
                  {animal[0].toUpperCase() + animal.slice(1)}
                </ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={2}>
                  {[notification.landmark?.trim(), labelFor(REPORT_STATUSES, notification.status)]
                    .filter(Boolean)
                    .join(' · ')}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <HugeiconsIcon icon={ArrowRight01Icon} size={18} color={muted} />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </ListGroup>
        </View>
      </ScrollView>

      {/* Held at the foot: the one thing to do next. A message leads to its chat first. */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.three }]}>
        {chat && (
          <Button
            onPress={() => router.push({ pathname: '/chat/[claimId]', params: { claimId: chat } })}>
            Open chat
          </Button>
        )}
        <Button variant={chat ? 'secondary' : 'primary'} onPress={openReport}>
          Open report
        </Button>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    padding: Spacing.four,
  },
  skeleton: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  // Same column as the list it was opened from.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.five,
    padding: Spacing.four,
  },
  lead: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTint: {
    opacity: 0.12,
  },
  leadText: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  // The one large line on the page.
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
    textAlign: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  // Narrow enough that the sentence breaks into even lines.
  line: {
    maxWidth: 320,
    fontWeight: 400,
  },
  reason: {
    gap: Spacing.one,
    padding: Spacing.three,
  },
  reasonText: {
    fontWeight: 600,
  },
  about: {
    gap: Spacing.two,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.two + Spacing.half,
  },
  actions: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
});
