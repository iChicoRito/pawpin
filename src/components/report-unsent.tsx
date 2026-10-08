import { Image } from 'expo-image';
import { Button } from 'heroui-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReportSent, type PhotoSizes } from '@/components/report-sent';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import {
  ANIMAL_TYPES,
  discardUnsentReport,
  GUEST_LIMIT_ERROR,
  submitReport,
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
  const [photoSizes, setPhotoSizes] = useState<PhotoSizes>([]);

  const isSending = status === 'sending';
  const animal = ANIMAL_TYPES.find((type) => type.value === draft.animalType)?.label ?? 'Animal';

  async function sendAgain() {
    if (!session) return;
    setStatus('sending');
    try {
      setPhotoSizes(await submitReport(draft, session.user.id));
      await discardUnsentReport();
      setStatus('sent');
    } catch (error) {
      const isLimit = error instanceof Error && error.message === GUEST_LIMIT_ERROR;
      if (!isLimit) console.warn('Sending the kept report failed:', error);
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

  if (status === 'sent') return <ReportSent photoSizes={photoSizes} onDone={onGone} />;

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
            <Image source={{ uri: draft.photos[0].uri }} style={styles.photo} />
            <View style={styles.summaryText}>
              <ThemedText type="smallBold">{animal}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Photo taken {new Date(draft.photos[0].takenAt).toLocaleString()}
              </ThemedText>
            </View>
          </View>

          {status === 'failed' && (
            <ThemedText type="small" role="alert">
              Still could not send it. It stays saved on this phone. Check your connection and try
              again.
            </ThemedText>
          )}
          {status === 'limit' && (
            <ThemedText type="small" role="alert">
              Guests can send 3 reports in 24 hours. Sign in with Google on the Profile tab to send
              this one.
            </ThemedText>
          )}

          {status === 'confirmDiscard' ? (
            <>
              <ThemedText type="small" role="alert">
                Discard this report? It cannot be recovered.
              </ThemedText>
              <View style={styles.actions}>
                <Button variant="secondary" onPress={() => setStatus('idle')}>
                  Cancel
                </Button>
                <Button onPress={discard}>Discard</Button>
              </View>
            </>
          ) : (
            <View style={styles.actions}>
              <Button
                variant="secondary"
                isDisabled={isSending}
                onPress={() => setStatus('confirmDiscard')}>
                Discard
              </Button>
              <Button isDisabled={isSending} onPress={sendAgain}>
                {isSending ? 'Sending…' : 'Send again'}
              </Button>
            </View>
          )}
        </ThemedView>
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
    gap: Spacing.three,
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
