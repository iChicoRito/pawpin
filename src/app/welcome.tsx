import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Button, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Method = 'google' | 'guest';

async function signInAsGuest() {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export default function WelcomeScreen() {
  const [signingIn, setSigningIn] = useState<Method | null>(null);
  const [failed, setFailed] = useState(false);
  const danger = useThemeColor('danger');

  async function signIn(method: Method) {
    setSigningIn(method);
    setFailed(false);
    try {
      await (method === 'google' ? signInWithGoogle() : signInAsGuest());
      // On success the route guard in the root layout swaps this screen for the tabs.
    } catch (error) {
      // The screen shows a short message; the real cause goes to the dev log.
      console.warn('Sign-in failed:', error);
      setFailed(true);
    }
    setSigningIn(null);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.intro}>
          <ThemedText type="title">PawPin</ThemedText>
          <ThemedText themeColor="textSecondary">
            Spotted a stray? Pin the exact spot so rescuers can find it.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          {failed && (
            // Red marks the icon only. As small text on white it is 3.6:1, too faint to read.
            <View role="alert" style={styles.error}>
              <HugeiconsIcon icon={AlertCircleIcon} size={20} color={danger} />
              <ThemedText type="small" style={styles.errorText}>
                Could not sign you in. Check your connection and try again.
              </ThemedText>
            </View>
          )}
          <Button size="lg" isDisabled={signingIn !== null} onPress={() => signIn('google')}>
            {signingIn === 'google' ? 'Signing in…' : 'Continue with Google'}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            isDisabled={signingIn !== null}
            onPress={() => signIn('guest')}>
            {signingIn === 'guest' ? 'Signing in…' : 'Continue as Guest'}
          </Button>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Guests can report strays. Guest reports stay on this phone.
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  intro: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.three,
  },
  error: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  errorText: {
    flex: 1,
  },
  note: {
    textAlign: 'center',
  },
});
