import Location01Icon from '@hugeicons/core-free-icons/Location01Icon';
import * as Location from 'expo-location';
import { Spinner } from 'heroui-native';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PermissionRow } from '@/components/report-permissions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * Shows why the location is needed to find strays, then asks. Renders its children once it is
 * allowed. Someone who allowed it on the Report tab never sees this.
 */
export function LocationGate({ title, children }: PropsWithChildren<{ title: string }>) {
  const [location, requestLocation, refreshLocation] = Location.useForegroundPermissions();
  const insets = useSafeAreaInsets();

  // A permission changed in the phone's settings is only seen when the app is looked at again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLocation();
    });
    return () => subscription.remove();
  }, [refreshLocation]);

  // Still reading the saved answer. The card waits, so a returning user never sees it flash by.
  if (!location) {
    return (
      <ThemedView style={[styles.container, styles.loading]}>
        <Spinner />
      </ThemedView>
    );
  }

  if (location.granted) return children;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <View style={styles.intro}>
          <ThemedText type="subtitle" role="heading">
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            PawPin needs your location to find strays near you.
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.card}>
          <PermissionRow
            icon={Location01Icon}
            name="location"
            title="Location"
            reason="To show strays near you. PawPin reads it only while the app is open."
            permission={location}
            onAllow={requestLocation}
          />
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: Spacing.three,
  },
});
