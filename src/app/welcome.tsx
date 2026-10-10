import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Image } from 'expo-image';
import { Button, useThemeColor } from 'heroui-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandIcon, GOOGLE_LOGO } from '@/components/brand-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { signInWithGoogle } from '@/lib/auth';
import { GuestSignInError, signInAsGuest } from '@/lib/guest-auth';

type Method = 'google' | 'guest';

export default function WelcomeScreen() {
  const [signingIn, setSigningIn] = useState<Method | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const isSigningIn = useRef(false);
  const danger = useThemeColor('danger');
  const colorScheme = useColorScheme();

  async function signIn(method: Method) {
    if (isSigningIn.current) return;
    isSigningIn.current = true;
    setSigningIn(method);
    setFailure(null);
    try {
      await (method === 'google' ? signInWithGoogle() : signInAsGuest());
      // On success the route guard in the root layout swaps this screen for the tabs.
    } catch (error) {
      // The screen shows a short message; the real cause goes to the dev log.
      console.warn('Sign-in failed:', error);
      setFailure(error instanceof GuestSignInError
        ? error.message
        : 'Could not sign you in. Check your connection and try again.');
    } finally {
      isSigningIn.current = false;
      setSigningIn(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.intro}>
          <Image
            source={colorScheme === 'dark'
              ? require('../../assets/DarkMode.svg')
              : require('../../assets/LightMode.svg')}
            accessibilityLabel="PawPin"
            contentFit="contain"
            style={styles.logo}
          />
        </View>

        <View style={styles.actions}>
          {failure && (
            // Red marks the icon only. As small text on white it is 3.6:1, too faint to read.
            <View role="alert" style={styles.error}>
              <HugeiconsIcon icon={AlertCircleIcon} size={20} color={danger} />
              <ThemedText type="small" style={styles.errorText}>
                {failure}
              </ThemedText>
            </View>
          )}
          <Button size="lg" isDisabled={signingIn !== null} onPress={() => signIn('google')}>
            <BrandIcon xml={GOOGLE_LOGO} size={22} />
            <Button.Label>
              {signingIn === 'google' ? 'Signing in…' : 'Continue with Google'}
            </Button.Label>
          </Button>
          <Button
            size="lg"
            variant="secondary"
            isDisabled={signingIn !== null}
            onPress={() => signIn('guest')}>
            {signingIn === 'guest' ? 'Signing in…' : 'Continue as Guest'}
          </Button>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Guests can report strays. This phone can create one guest account every 3 days.
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
  logo: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    aspectRatio: 735 / 253,
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
