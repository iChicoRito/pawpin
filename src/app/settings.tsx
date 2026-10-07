import { Button } from 'heroui-native';
import { useState, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'confirming' | 'working' | 'failed';

export default function SettingsScreen() {
  const { isGuest, name } = useSession();
  const [status, setStatus] = useState<Status>('idle');

  async function signOut() {
    setStatus('working');
    const { error } = await supabase.auth.signOut();
    // On success the route guard in the root layout swaps this screen for the welcome screen.
    if (error) {
      console.warn('Sign-out failed:', error);
      setStatus('failed');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Account">
          <ThemedText>{name ?? (isGuest ? 'Guest' : 'Google account')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {isGuest ? 'Not signed in. This account lives on this phone only.' : 'Signed in with Google'}
          </ThemedText>
        </Section>

        <Section title="Privacy">
          <ThemedText type="small" themeColor="textSecondary">
            {isGuest
              ? 'PawPin keeps the reports you make, and your name if you add one. No email is stored for guests.'
              : 'PawPin keeps your Google name and photo, and the reports you make.'}
          </ThemedText>
        </Section>

        {status === 'confirming' ? (
          // A guest account cannot be signed back into, so signing out is permanent for it.
          <ThemedView type="backgroundElement" role="alert" style={styles.card}>
            <ThemedText type="smallBold">Sign out as a guest?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your guest account and its reports cannot be recovered.
            </ThemedText>
            <View style={styles.choices}>
              <Button variant="secondary" onPress={() => setStatus('idle')}>
                Cancel
              </Button>
              <Button variant="danger" onPress={signOut}>
                Sign out
              </Button>
            </View>
          </ThemedView>
        ) : (
          <View style={styles.signOut}>
            {status === 'failed' && (
              <ThemedText type="small" role="alert">
                Could not sign you out. Check your connection and try again.
              </ThemedText>
            )}
            <Button
              variant="secondary"
              isDisabled={status === 'working'}
              onPress={isGuest ? () => setStatus('confirming') : signOut}>
              {status === 'working' ? 'Signing out…' : 'Sign out'}
            </Button>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  choices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  signOut: {
    gap: Spacing.two,
  },
});
