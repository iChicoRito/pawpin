import { HugeiconsIcon } from '@hugeicons/react-native';
import { Image } from 'expo-image';
import { Chip, ListGroup, Separator, Skeleton, useThemeColor } from 'heroui-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatAge } from '@/lib/format';
import { CHAT_ENDS, type ChatSummary } from '@/lib/messages';
import { ANIMAL_TYPES, labelFor } from '@/lib/reports';

const PHOTO_SIZE = 44;
const DOT_SIZE = 8;
const SKELETON_ROWS = 4;

type ChatListProps = {
  /** Newest activity first. */
  chats: ChatSummary[];
  onOpen: (chat: ChatSummary) => void;
};

/**
 * The viewer's chats about reports, in the same grouped list as the notifications: the animal's
 * photo, who the chat is with, the animal and the last thing said, and how long ago. An unread
 * chat carries a dot and a heavier name; an ended one says how it ended in place of the time.
 */
export function ChatList({ chats, onOpen }: ChatListProps) {
  const [accent, success, danger, muted] = useThemeColor(['accent', 'success', 'danger', 'muted']);
  const chipColor = (tone: 'success' | 'danger' | 'plain') =>
    tone === 'success' ? success : tone === 'danger' ? danger : muted;
  return (
    <ListGroup>
      {chats.map((chat, index) => {
        const name = chat.otherName?.trim() || 'Guest';
        const animal = labelFor(ANIMAL_TYPES, chat.animalType) || 'Animal';
        const last = chat.lastBody
          ? `${chat.lastFromMe ? 'You: ' : ''}${chat.lastBody}`
          : 'No messages yet';
        const age = chat.lastAt ? formatAge(chat.lastAt) : '';
        // Why it can no longer be written to: "Rescued", "Closed", "Gave up".
        const end = chat.ended && CHAT_ENDS[chat.ended];
        return (
          <Fragment key={chat.claimId}>
            {index > 0 && <Separator className="mx-4" />}
            <ListGroup.Item
              role="button"
              onPress={() => onOpen(chat)}
              accessibilityHint="Opens this chat"
              accessible
              aria-label={`${chat.isUnread ? 'Unread. ' : ''}${name}, ${chat.otherIsRescuer ? 'rescuer' : 'reporter'}, about the ${animal.toLowerCase()}. ${last}${age ? `, ${age.toLowerCase()}` : ''}${end ? `. Chat ended: ${end.title}` : ''}`}>
              <ListGroup.ItemPrefix>
                {chat.photo ? (
                  <Image source={{ uri: chat.photo }} style={styles.photo} />
                ) : (
                  <ThemedView type="backgroundSelected" style={styles.photo} />
                )}
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1} style={chat.isUnread && styles.unread}>
                  {name}
                </ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={1}>
                  {animal} · {last}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <View style={styles.end}>
                  {end ? (
                    <Chip
                      size="sm"
                      variant="secondary"
                      color={
                        end.tone === 'success' ? 'success' : end.tone === 'danger' ? 'danger' : 'default'
                      }>
                      <HugeiconsIcon icon={end.icon} size={12} color={chipColor(end.tone)} />
                      <Chip.Label>{end.label}</Chip.Label>
                    </Chip>
                  ) : (
                    <ThemedText themeColor="textSecondary" style={styles.age}>
                      {age}
                    </ThemedText>
                  )}
                  {chat.isUnread && <View style={[styles.dot, { backgroundColor: accent }]} />}
                </View>
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </Fragment>
        );
      })}
    </ListGroup>
  );
}

/** The shape of the list while it is read. */
export function ChatListSkeleton() {
  return (
    <View accessible aria-busy aria-label="Loading chats">
      <ListGroup>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <Fragment key={row}>
            {row > 0 && <Separator className="mx-4" />}
            <ListGroup.Item pointerEvents="none">
              <ListGroup.ItemPrefix>
                <Skeleton className="h-11 w-11 rounded-xl" />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <View style={styles.skeletonText}>
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-3 w-44 rounded-md" />
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
  // The smallest text on the row: it is read last.
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
