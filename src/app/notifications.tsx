import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import Notification01Icon from '@hugeicons/core-free-icons/Notification01Icon';
import { Stack, useIsFocused, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/notice';
import { NotificationList, NotificationListSkeleton } from '@/components/notification-list';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import {
  fetchNotifications,
  markAllRead,
  useUnreadCount,
  type AppNotification,
} from '@/lib/notifications';

/** Everything that happened to the viewer's reports and rescues. Opened from the Profile tab. */
export default function NotificationsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id;
  // `undefined` while being read, `null` when it could not be.
  const [notifications, setNotifications] = useState<AppNotification[] | null | undefined>(
    undefined,
  );
  const [isPulling, setIsPulling] = useState(false);
  // Counts tries, so "Try again" and a pull down read once more.
  const [attempt, setAttempt] = useState(0);
  // Changes when a notification arrives or is read, so the list is read again while it is open.
  const unread = useUnreadCount(userId);

  useEffect(() => {
    if (!userId || !isFocused) return;
    let isGone = false;
    fetchNotifications(userId)
      .then((found) => {
        if (!isGone) setNotifications(found);
      })
      .catch((error) => {
        console.warn('Loading notifications failed:', error);
        // A quiet read that fails leaves the list as it was.
        if (!isGone) setNotifications((shown) => shown ?? null);
      })
      .finally(() => {
        if (!isGone) setIsPulling(false);
      });
    return () => {
      isGone = true;
    };
  }, [userId, attempt, isFocused, unread]);

  // Nothing to list: the message sits in the middle of the screen.
  const isCentered = notifications === null || notifications?.length === 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: unread
            ? () => (
                <Button
                  variant="tertiary"
                  size="sm"
                  onPress={() => {
                    if (!userId) return;
                    // The live change that follows reads the list again.
                    markAllRead(userId).catch((error) =>
                      console.warn('Marking all read failed:', error),
                    );
                  }}>
                  Mark all read
                </Button>
              )
            : undefined,
        }}
      />
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
        {notifications === undefined ? (
          <NotificationListSkeleton />
        ) : notifications === null ? (
          <Notice
            icon={AlertCircleIcon}
            title="Could not load notifications"
            text="Check your connection and try again."
            action="Try again"
            onAction={() => {
              setNotifications(undefined);
              setAttempt(attempt + 1);
            }}
            isAlert
          />
        ) : notifications.length === 0 ? (
          <Notice
            icon={Notification01Icon}
            title="Nothing yet"
            text="When something happens to a stray you reported, or one you are going to, it is kept here."
          />
        ) : (
          <NotificationList
            notifications={notifications}
            onOpen={(notification) =>
              router.push({ pathname: '/notification/[id]', params: { id: notification.id } })
            }
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as "Your reports".
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
});
