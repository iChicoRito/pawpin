import { Button } from 'heroui-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '@/components/animated-splash';
import { BrandIcon, GOOGLE_LOGO } from '@/components/brand-icon';
import { ToastIcon } from '@/components/report-sent';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFeedbackToast } from '@/hooks/use-feedback';
import { signInWithGoogle } from '@/lib/auth';
import { GuestSignInError, signInAsGuest } from '@/lib/guest-auth';
import { setSplashTarget } from '@/lib/splash-target';

type Method = 'google' | 'guest';

export default function WelcomeScreen() {
  const [signingIn, setSigningIn] = useState<Method | null>(null);
  const isSigningIn = useRef(false);
  const { toast } = useFeedbackToast();
  const logo = useRef<View>(null);

  // The logo's place in the window is told to the splash, which moves its own banner onto it.
  function measureLogo() {
    logo.current?.measureInWindow((left, top, width, height) =>
      setSplashTarget({ left, top, width, height })
    );
  }

  async function signIn(method: Method) {
    if (isSigningIn.current) return;
    isSigningIn.current = true;
    setSigningIn(method);
    try {
      await (method === 'google' ? signInWithGoogle() : signInAsGuest());
      // On success the route guard in the root layout swaps this screen for the tabs.
    } catch (error) {
      // The toast shows a short message; the real cause goes to the dev log.
      console.warn('Sign-in failed:', error);
      toast.show({
        variant: 'danger',
        icon: <ToastIcon status="danger" />,
        label: 'Could not sign you in',
        description: error instanceof GuestSignInError
          ? error.message
          : 'Check your connection and try again.',
      });
    } finally {
      isSigningIn.current = false;
      setSigningIn(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.intro}>
          <View
            ref={logo}
            onLayout={measureLogo}
            accessible
            accessibilityRole="image"
            accessibilityLabel="PawPin"
            style={styles.logo}>
            <Banner still />
          </View>
        </View>

        <View style={styles.actions}>
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
  },
  note: {
    textAlign: 'center',
  },
});
