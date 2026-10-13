import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import BubbleChatIcon from '@hugeicons/core-free-icons/BubbleChatIcon';
import { useIsFocused, useRouter } from 'expo-router';
import { Typography } from 'heroui-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatList, ChatListSkeleton } from '@/components/chat-list';
import { Notice } from '@/components/notice';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useChats } from '@/lib/messages';

/**
 * The Chats tab: every chat the viewer has about a report, as its reporter or as the rescuer on
 * the way. A way back into a chat, not a way to start one: a chat begins with "I'm on my way".
 */
export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { session } = useSession();
  // Tabs stay mounted, so coming back into view reads the list again: a chat may have been read.
  const { chats, reload } = useChats(session?.user.id, isFocused);
  const [isPulling, setIsPulling] = useState(false);

  // Nothing to list: the message sits in the middle of the screen.
  const isCentered = chats === null || chats?.length === 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.four },
          isCentered && styles.centered,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isPulling}
            onRefresh={() => {
              // The read is quiet, so the spinner is given a moment of its own.
              setIsPulling(true);
              reload();
              setTimeout(() => setIsPulling(false), 600);
            }}
          />
        }>
        {!isCentered && (
          <Typography type="h3" role="heading">
            Chats
          </Typography>
        )}
        {chats === undefined ? (
          <ChatListSkeleton />
        ) : chats === null ? (
          <Notice
            icon={AlertCircleIcon}
            title="Could not load your chats"
            text="Check your connection and try again."
            action="Try again"
            onAction={reload}
            isAlert
          />
        ) : chats.length === 0 ? (
          <Notice
            icon={BubbleChatIcon}
            title="No chats yet"
            text="A chat opens when a rescuer is on the way to a stray you reported, or when you go to one."
          />
        ) : (
          <ChatList
            chats={chats}
            onOpen={(chat) =>
              router.push({ pathname: '/chat/[claimId]', params: { claimId: chat.claimId } })
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
  // Same column as the Profile tab.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  // As tall as the screen, so the message can sit in the middle of it.
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
