import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider } from 'heroui-native';
import { useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/global.css';

import { AnimatedSplash } from '@/components/animated-splash';
import { DrawerBackdropProvider, DrawerBlurTarget } from '@/components/drawer-backdrop';
import { SoundEffects } from '@/components/sound-effects';
import { NearbyReportsProvider } from '@/hooks/use-nearby-reports';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { useAlertRegistration } from '@/lib/alerts';
import { loadAppearance } from '@/lib/appearance';

SplashScreen.preventAutoHideAsync();
// Started here, while the splash is still up, so the app does not open in the wrong colors.
loadAppearance();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DrawerBackdropProvider>
        <HeroUINativeProvider>
          <DrawerBlurTarget>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <SessionProvider>
                <SoundEffects />
                <NearbyReportsProvider>
                  <RootNavigator />
                </NearbyReportsProvider>
              </SessionProvider>
            </ThemeProvider>
          </DrawerBlurTarget>
        </HeroUINativeProvider>
      </DrawerBackdropProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  useAlertRegistration(session?.user.id);

  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {/* No screen until the saved session is read, so the wrong one never flashes under the splash. */}
      {isLoading ? null : <Screens session={session} />}
      {splashDone ? null : <AnimatedSplash ready={!isLoading} toLogo={!session} onDone={() => setSplashDone(true)} />}
    </>
  );
}

function Screens({ session }: { session: unknown }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: 'About PawPin' }} />
        <Stack.Screen name="alerts" options={{ headerShown: true, title: 'Alerts' }} />
        <Stack.Screen name="safety" options={{ headerShown: true, title: 'Safety tips' }} />
        <Stack.Screen name="report/[id]" options={{ headerShown: true, title: 'Report' }} />
        {/* The screen sets its own title: "Your reports" or "Your rescues". */}
        <Stack.Screen name="history" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="notifications"
          options={{ headerShown: true, title: 'Notifications' }}
        />
        <Stack.Screen
          name="notification/[id]"
          options={{ headerShown: true, title: 'Notification' }}
        />
        {/* The screen sets its own title: "About the dog". */}
        <Stack.Screen name="chat/[claimId]" options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="components" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
    </Stack>
  );
}
