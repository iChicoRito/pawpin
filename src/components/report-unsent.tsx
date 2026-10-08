import { Alert, Button, Spinner, useThemeColor, useToast } from 'heroui-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReportSent, ToastIcon } from '@/components/report-sent';
import { PhotoThumb } from '@/components/report-photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import {
  ANIMAL_TYPES,
  animalOf,
  discardUnsentReport,
  GUEST_LIMIT_ERROR,
  submitReport,
  URGENCIES,
  type ReportDraft,
} from '@/lib/reports';

type Status = 'idle' | 'sending' | 'sent' | 'limit' | 'failed' | 'confirmDiscard';

type ReportUnsentProps = {
  draft: ReportDraft;
  /** The kept report is gone, either sent or discarded. */
  onGone: () => void;
};

/** A report that could not be sent earlier and is kept on this phone until it is sent or discarded. */
export function ReportUnsent({ draft, onGone }: ReportUnsentProps) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [status, setStatus] = useState<Status>('idle');

  const isSending = status === 'sending';
  const { toast } = useToast();
  const accentForeground = useThemeColor('accent-foreground');
  const kind = animalOf(draft);
  // A typed kind has no entry in the list and is shown as typed.
  const animal = ANIMAL_TYPES.find((type) => type.value === kind)?.label ?? (kind || 'Animal');
  const urgency = URGENCIES.find((option) => option.value === draft.urgency)?.label;

  async function sendAgain() {
    if (!session) return;
    setStatus('sending');
    try {
      await submitReport(draft, session.user.id);
      await discardUnsentReport();
      toast.show({
        variant: 'success',
        label: 'Report sent',
        icon: <ToastIcon status="success" />,
      });
      setStatus('sent');
    } catch (error) {
      const isLimit = error instanceof Error && error.message === GUEST_LIMIT_ERROR;
      if (!isLimit) console.warn('Sending the kept report failed:', error);
      toast.show({
        variant: 'danger',
        icon: <ToastIcon status="danger" />,
        label: 'Report not sent',
        description: isLimit
          ? 'Guests can send 3 reports in 24 hours.'
          : 'It is still saved on this phone.',
      });
      setStatus(isLimit ? 'limit' : 'failed');
    }
  }

  async function discard() {
    try {
      await discardUnsentReport();
    } catch (error) {
      console.warn('Discarding the kept report failed:', error);
    }
    onGone();
  }

  // The kept photo files were deleted once the report went through, so none are shown.
  if (status === 'sent') return <ReportSent draft={{ ...draft, photos: [] }} onDone={onGone} />;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <View style={styles.intro}>
          <ThemedText type="subtitle" role="heading">
            Report not sent
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            It is saved on this phone. Send it again when you have signal.
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.summary}>
            <PhotoThumb uri={draft.photos[0].uri} label="Photo 1" style={styles.photo} />
            <View style={styles.summaryText}>
              <ThemedText style={styles.animal}>{animal}</ThemedText>
              {urgency && <ThemedText type="small">{urgency}</ThemedText>}
              <ThemedText type="small" themeColor="textSecondary">
                Photo taken {new Date(draft.photos[0].takenAt).toLocaleString()}
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        {status === 'failed' && (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                Still could not send it. It stays saved on this phone. Check your connection and try
                again.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {status === 'limit' && (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                Guests can send 3 reports in 24 hours. Sign in with Google on the Profile tab to send
                this one.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {status === 'confirmDiscard' ? (
          <>
            <ThemedText role="alert">Discard this report? It cannot be recovered.</ThemedText>
            <View style={styles.actions}>
              <Button variant="secondary" onPress={() => setStatus('idle')}>
                Cancel
              </Button>
              <Button variant="danger" style={styles.mainAction} onPress={discard}>
                Discard
              </Button>
            </View>
          </>
        ) : (
          <View style={styles.actions}>
            <Button
              variant="tertiary"
              isDisabled={isSending}
              onPress={() => setStatus('confirmDiscard')}>
              Discard
            </Button>
            <Button style={styles.mainAction} isDisabled={isSending} onPress={sendAgain}>
              {isSending && <Spinner size="sm" color={accentForeground} />}
              <Button.Label>{isSending ? 'Sending…' : 'Send again'}</Button.Label>
            </Button>
          </View>
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
  intro: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  summaryText: {
    flex: 1,
    gap: Spacing.half,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: Spacing.two,
  },
  animal: {
    fontWeight: 600,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  mainAction: {
    flex: 1,
  },
});
