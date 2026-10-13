import { Image } from 'expo-image';
import { ListGroup, Separator, Skeleton, useThemeColor } from 'heroui-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthOf } from '@/components/profile-history';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatAge } from '@/lib/format';
import { animalIn, NOTIFICATION_KINDS, type AppNotification } from '@/lib/notifications';

const PHOTO_SIZE = 40;
const DOT_SIZE = 8;
/** About one screen of rows, so the page does not jump much when the real ones arrive. */
const SKELETON_ROWS = 6;

type NotificationListProps = {
  /** Newest first. */
  notifications: AppNotification[];
  onOpen: (notification: AppNotification) => void;
};

/**
 * What happened to a person's reports and rescues, month by month, in the same grouped list as
 * "Your reports": the report's photo, what happened, which animal and where, and how long ago.
 * An unread row carries a dot and a heavier title.
 */
export function NotificationList({ notifications, onOpen }: NotificationListProps) {
  const accent = useThemeColor('accent');
  // Already newest first, so the months come out in order and each row joins the last month seen.
  const months: { title: string; rows: AppNotification[] }[] = [];
  for (const notification of notifications) {
    const title = monthOf(notification.createdAt);
    const last = months[months.length - 1];
    if (last?.title === title) last.rows.push(notification);
    else months.push({ title, rows: [notification] });
  }

  return (
    <View style={styles.months}>
      {months.map((month) => (
        <View key={month.title} style={styles.month}>
          <ThemedText type="small" role="heading" themeColor="textSecondary">
            {month.title}
          </ThemedText>
          <ListGroup>
            {month.rows.map((notification, index) => {
              const { title } = NOTIFICATION_KINDS[notification.kind];
              const animal = animalIn(notification);
              const about = [animal[0].toUpperCase() + animal.slice(1), notification.landmark?.trim()]
                .filter(Boolean)
                .join(' · ');
              const age = formatAge(notification.createdAt);
              const isUnread = !notification.readAt;
              return (
                <Fragment key={notification.id}>
                  {index > 0 && <Separator className="mx-4" />}
                  <ListGroup.Item
                    role="button"
                    onPress={() => onOpen(notification)}
                    accessibilityHint="Opens this notification"
                    accessible
                    aria-label={`${isUnread ? 'Unread. ' : ''}${title}, ${about}, ${age.toLowerCase()}`}>
                    <ListGroup.ItemPrefix>
                      {notification.photo ? (
                        <Image source={{ uri: notification.photo }} style={styles.photo} />
                      ) : (
                        <ThemedView type="backgroundSelected" style={styles.photo} />
                      )}
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1} style={isUnread && styles.unread}>
                        {title}
                      </ListGroup.ItemTitle>
                      <ListGroup.ItemDescription numberOfLines={1}>{about}</ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <View style={styles.end}>
                        <ThemedText themeColor="textSecondary" style={styles.age}>
                          {age}
                        </ThemedText>
                        {isUnread && <View style={[styles.dot, { backgroundColor: accent }]} />}
                      </View>
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

/** The shape of the list while it is read: a month and its rows. */
export function NotificationListSkeleton() {
  return (
    <View accessible aria-busy aria-label="Loading notifications" style={styles.month}>
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
                  <Skeleton className="h-4 w-36 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
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
  unread: {
    fontWeight: 700,
  },
  // The time, then the dot under it, both against the end.
  end: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  // The smallest text on the row: it is read last. Digits of equal width, so times line up.
  age: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  skeletonText: {
    gap: Spacing.two,
  },
});
