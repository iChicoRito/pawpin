import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider } from 'heroui-native';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/global.css';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { NearbyReportsProvider } from '@/hooks/use-nearby-reports';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { loadAppearance } from '@/lib/appearance';

SplashScreen.preventAutoHideAsync();
// Started here, while the splash is still up, so the app does not open in the wrong colors.
loadAppearance();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SessionProvider>
            <NearbyReportsProvider>
              <RootNavigator />
            </NearbyReportsProvider>
          </SessionProvider>
        </ThemeProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();

  // The phone's own splash stays up until the saved session is read, so the wrong screen never flashes.
  if (isLoading) return null;

  return (
    <>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
          <Stack.Screen name="report/[id]" options={{ headerShown: true, title: 'Report' }} />
          {/* The screen sets its own title: "Your reports" or "Your rescues". */}
          <Stack.Screen name="history" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="components" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
