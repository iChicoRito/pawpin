import { Button } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { linkGoogle, signInWithGoogle, type AuthFlowError } from '@/lib/auth';

export default function ProfileScreen() {
  const { session, isGuest } = useSession();

  const user = session?.user;
  const name: string | undefined =
    user?.user_metadata?.full_name ??
    user?.identities?.find((identity) => identity.provider === 'google')?.identity_data?.full_name;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Profile</ThemedText>
      {isGuest ? <GuestCard /> : name && <ThemedText>{name}</ThemedText>}
    </ThemedView>
  );
}

type Status = 'idle' | 'working' | 'failed' | 'conflict';

function GuestCard() {
  const [status, setStatus] = useState<Status>('idle');

  async function run(action: () => Promise<boolean>) {
    setStatus('working');
    try {
      await action();
      setStatus('idle');
    } catch (error) {
      // The chosen Google account already has its own PawPin account, so it cannot be joined to this guest.
      const isConflict = (error as AuthFlowError).code === 'identity_already_exists';
      if (!isConflict) console.warn('Google sign-in failed:', error);
      setStatus(isConflict ? 'conflict' : 'failed');
    }
  }

  if (status === 'conflict') {
    return (
      <ThemedView type="backgroundElement" role="alert" style={styles.card}>
        <ThemedText type="smallBold">This Google account already has a PawPin account</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Switch to it? Reports made as a guest will stay with the guest account.
        </ThemedText>
        <View style={styles.choices}>
          <Button variant="secondary" onPress={() => setStatus('idle')}>
            Cancel
          </Button>
          <Button onPress={() => run(signInWithGoogle)}>Switch account</Button>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">You are using PawPin as a guest</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your reports can be lost if you uninstall the app or change phones. Sign in with Google to
        keep them.
      </ThemedText>
      {status === 'failed' && (
        <ThemedText type="small" role="alert">
          Could not sign you in. Check your connection and try again.
        </ThemedText>
      )}
      <Button isDisabled={status === 'working'} onPress={() => run(linkGoogle)}>
        {status === 'working' ? 'Signing in…' : 'Sign in with Google'}
      </Button>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  choices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
