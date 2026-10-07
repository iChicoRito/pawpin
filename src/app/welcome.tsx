import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Button, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function WelcomeScreen() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [failed, setFailed] = useState(false);
  const danger = useThemeColor('danger');

  async function continueAsGuest() {
    setIsSigningIn(true);
    setFailed(false);
    const { error } = await supabase.auth.signInAnonymously().catch((error: unknown) => ({ error }));
    // On success the route guard in the root layout swaps this screen for the tabs.
    if (error) {
      setFailed(true);
      setIsSigningIn(false);
    }
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
          <Button size="lg" isDisabled={isSigningIn} onPress={continueAsGuest}>
            {isSigningIn ? 'Signing in…' : 'Continue as Guest'}
          </Button>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            No account needed. Guest reports stay on this phone.
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
