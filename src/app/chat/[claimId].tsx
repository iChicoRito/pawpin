import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import SentIcon from '@hugeicons/core-free-icons/SentIcon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Avatar, Button, Input, Skeleton, TextField, useThemeColor } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { formatAge, initialsOf } from '@/lib/format';
import {
  CHAT_ENDS,
  chatRefusalOf,
  MESSAGE_MAX_LENGTH,
  sendMessage,
  useThread,
} from '@/lib/messages';
import { markMessagesRead } from '@/lib/notifications';
import { ANIMAL_TYPES, labelFor } from '@/lib/reports';

/** From this many characters on, the box says how many are left. */
const COUNTER_FROM = 400;

/**
 * The chat about one report, between its reporter and the rescuer on the way. Opened from the
 * report page or from a "New message" notification, never from a list of people. Once the rescuer
 * gives up or the report ends, it can be read and no longer written to.
 */
export default function ChatScreen() {
  const { claimId } = useLocalSearchParams<{ claimId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { session, isAdmin } = useSession();
  const userId = session?.user.id;
  const [accent, accentForeground, success, danger, foreground] = useThemeColor([
    'accent',
    'accent-foreground',
    'success',
    'danger',
    'foreground',
  ]);
  const { thread, failed, again } = useThread(claimId, userId);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  // Why the last message was not sent. Cleared by the next try.
  const [problem, setProblem] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const count = thread?.messages.length ?? 0;
  const reportId = thread?.reportId;

  // Being here is reading it: the "New message" line in the list loses its dot. Again on each new
  // message, since one may arrive while the chat is open.
  useEffect(() => {
    if (reportId && userId) markMessagesRead(reportId, userId);
  }, [reportId, userId, count]);

  if (!thread) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Chat' }} />
        {thread === undefined && !failed ? (
          <View accessible aria-busy aria-label="Loading chat" style={styles.skeleton}>
            <Skeleton className="h-10 w-48 self-start rounded-2xl" />
            <Skeleton className="h-10 w-56 self-end rounded-2xl" />
            <Skeleton className="h-10 w-40 self-start rounded-2xl" />
          </View>
        ) : thread === null ? (
          <Notice
            icon={AlertCircleIcon}
            title="This chat is not available"
            text="It belongs to a report that is no longer on PawPin."
            action="Back"
            onAction={() => router.back()}
          />
        ) : (
          <Notice
            icon={AlertCircleIcon}
            title="Could not load this chat"
            text="Check your connection and try again."
            action="Try again"
            onAction={again}
            isAlert
          />
        )}
      </ThemedView>
    );
  }

  const animal = (labelFor(ANIMAL_TYPES, thread.animalType) || 'animal').toLowerCase();
  const otherName = thread.other.name?.trim() || 'Guest';
  const words = draft.trim();
  const end = thread.ended && CHAT_ENDS[thread.ended];
  const endColor = end?.tone === 'success' ? success : end?.tone === 'danger' ? danger : foreground;

  async function send() {
    if (!claimId || !words || isSending) return;
    setIsSending(true);
    setProblem(null);
    // Emptied at once, so the next message can be typed. Put back if this one is not sent.
    setDraft('');
    try {
      await sendMessage(claimId, words);
    } catch (error) {
      const refusal = chatRefusalOf(error);
      if (!refusal) console.warn('Sending the message failed:', error);
      setDraft(words);
      setProblem(
        refusal === 'chat_closed'
          ? 'This chat has ended.'
          : refusal === 'too_fast'
            ? 'That is a lot of messages. Wait a minute, then send again.'
            : refusal === 'not_in_chat'
              ? 'You are not part of this chat.'
              : 'Not sent. Check your connection and try again.',
      );
      // The claim has changed under us: read it, so the box gives way to the closing line.
      if (refusal === 'chat_closed') again();
    } finally {
      setIsSending(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `About the ${animal}` }} />
      {/* The header sits above this view. Without its height the lift comes up that much short, and
          the keyboard covers the text box. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={styles.container}>
        {/* Who this is with, and a way to the report the chat is about. */}
        <View style={styles.who}>
          <Avatar alt={otherName} size="md" color="accent" variant="soft">
            {thread.other.avatarUrl && <Avatar.Image source={{ uri: thread.other.avatarUrl }} />}
            <Avatar.Fallback>
              {thread.other.name?.trim() ? (
                initialsOf(otherName)
              ) : (
                <HugeiconsIcon icon={UserIcon} size={20} color={accent} />
              )}
            </Avatar.Fallback>
          </Avatar>
          <View style={styles.whoText}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {otherName}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {thread.other.isRescuer ? 'The rescuer' : 'Reported this animal'}
            </ThemedText>
          </View>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => router.push({ pathname: '/report/[id]', params: { id: thread.reportId } })}>
            Report
          </Button>
        </View>

        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          // The newest message is the one to read: keep to the foot as the thread grows.
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={[styles.messages, count === 0 && styles.centered]}>
          {count === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              {thread.isOpen
                ? 'No messages yet. Say where you are, or ask where the animal went.'
                : 'No messages were sent.'}
            </ThemedText>
          ) : (
            thread.messages.map((message) => {
              const isMine = message.senderId === userId;
              // For an admin, who wrote neither side: the rescuer at the end, the reporter at the start.
              const atEnd = isAdmin ? message.senderId === thread.other.id : isMine;
              return (
                <View
                  key={message.id}
                  accessible
                  aria-label={`${isMine ? 'You' : message.senderId === thread.other.id ? otherName : 'Reporter'}: ${message.body}, ${formatAge(message.createdAt).toLowerCase()}`}
                  style={[styles.message, atEnd ? styles.mine : styles.theirs]}>
                  <ThemedView
                    type={atEnd ? undefined : 'backgroundElement'}
                    style={[styles.bubble, atEnd && { backgroundColor: accent }]}>
                    <ThemedText style={[styles.body, atEnd && { color: accentForeground }]}>
                      {message.body}
                    </ThemedText>
                  </ThemedView>
                  <ThemedText themeColor="textSecondary" style={styles.age}>
                    {formatAge(message.createdAt)}
                  </ThemedText>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.foot, { paddingBottom: insets.bottom + Spacing.two }]}>
          {problem && (
            <ThemedText type="small" role="alert">
              {problem}
            </ThemedText>
          )}
          {/* Where the text box was: why there is none. Said to an admin too, who never had one. */}
          {end && (
            <ThemedView type="backgroundElement" role="status" style={styles.ended}>
              {/* Says how it ended before a word is read. The tint is a see-through layer, since theme
                  colors come in more than one notation. */}
              <View aria-hidden style={styles.endedIcon}>
                <View
                  style={[StyleSheet.absoluteFill, styles.endedTint, { backgroundColor: endColor }]}
                />
                <HugeiconsIcon icon={end.icon} size={22} color={endColor} />
              </View>
              <View style={styles.endedText}>
                <ThemedText style={[styles.endedTitle, { color: endColor }]}>{end.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  {end.text}
                  {thread.ended === 'closed_by_admin' &&
                    thread.closeReason &&
                    ` Reason: ${thread.closeReason}.`}
                  {!isAdmin && ' You can still read it.'}
                </ThemedText>
              </View>
            </ThemedView>
          )}
          {isAdmin ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              You are reading this chat as an admin.
            </ThemedText>
          ) : end ? null : thread.isOpen ? (
            <>
              <View style={styles.compose}>
                <TextField style={styles.box}>
                  <Input
                    variant="secondary"
                    aria-label="Message"
                    placeholder="Write a message"
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={MESSAGE_MAX_LENGTH}
                    multiline
                  />
                </TextField>
                <Button
                  isIconOnly
                  aria-label="Send message"
                  isDisabled={!words || isSending}
                  onPress={send}>
                  <HugeiconsIcon icon={SentIcon} size={20} color={accentForeground} />
                </Button>
              </View>
              {draft.length >= COUNTER_FROM && (
                <ThemedText themeColor="textSecondary" style={styles.age}>
                  {MESSAGE_MAX_LENGTH - draft.length} left
                </ThemedText>
              )}
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              This chat has ended. You can still read it.
            </ThemedText>
          )}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  skeleton: {
    gap: Spacing.three,
  },
  // Same column as the rest of the app.
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  whoText: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontWeight: 600,
  },
  messages: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  // A message keeps to its writer's side and leaves the other side open.
  message: {
    maxWidth: '82%',
    gap: Spacing.half,
  },
  mine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  theirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
  },
  body: {
    fontWeight: 400,
  },
  // The smallest text: it is read last.
  age: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  foot: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  // The icon at the start, level with the middle of the words beside it.
  ended: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  endedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedTint: {
    opacity: 0.14,
  },
  endedText: {
    flex: 1,
    gap: Spacing.half,
  },
  endedTitle: {
    fontWeight: 600,
  },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  box: {
    flex: 1,
  },
});
