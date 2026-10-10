import Camera01Icon from '@hugeicons/core-free-icons/Camera01Icon';
import Location01Icon from '@hugeicons/core-free-icons/Location01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import type { PermissionResponse } from 'expo-modules-core';
import { Button, Spinner, useThemeColor } from 'heroui-native';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Shows why the camera and the location are needed, then asks. Renders its children once both are allowed. */
export function ReportPermissions({ children }: PropsWithChildren) {
  const [camera, requestCamera, refreshCamera] = useCameraPermissions();
  const [location, requestLocation, refreshLocation] = Location.useForegroundPermissions();
  const insets = useSafeAreaInsets();
  const border = useThemeColor('border');

  // A permission changed in the phone's settings is only seen when the app is looked at again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refreshCamera();
      refreshLocation();
    });
    return () => subscription.remove();
  }, [refreshCamera, refreshLocation]);

  // Still reading the saved answers. The cards wait, so a returning user never sees them flash by.
  if (!camera || !location) {
    return (
      <ThemedView style={[styles.container, styles.loading]}>
        <Spinner />
      </ThemedView>
    );
  }

  if (camera.granted && location.granted) return children;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <View style={styles.intro}>
          <ThemedText type="subtitle" role="heading">
            Report a stray
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            PawPin needs two things before the camera opens.
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.card}>
          <PermissionRow
            icon={Camera01Icon}
            name="camera"
            title="Camera"
            reason="To take the photo of the animal you are reporting."
            permission={camera}
            onAllow={requestCamera}
          />
          <View style={[styles.divider, { backgroundColor: border }]} />
          <PermissionRow
            icon={Location01Icon}
            name="location"
            title="Location"
            reason="So rescuers can find the animal. PawPin reads it only while the app is open."
            permission={location}
            onAllow={requestLocation}
          />
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

type PermissionRowProps = {
  icon: IconSvgElement;
  /** Lower case, as it reads inside a sentence and on the button. */
  name: string;
  title: string;
  reason: string;
  permission: PermissionResponse;
  onAllow: () => Promise<PermissionResponse>;
};

export function PermissionRow({ icon, name, title, reason, permission, onAllow }: PermissionRowProps) {
  const [foreground, accent] = useThemeColor(['foreground', 'accent']);
  // The phone will not show its prompt again, so the only way left is its settings.
  const isBlocked = !permission.granted && !permission.canAskAgain;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <ThemedView aria-hidden type="backgroundSelected" style={styles.icon}>
          <HugeiconsIcon icon={icon} size={24} color={foreground} />
        </ThemedView>
        <View style={styles.rowText}>
          <ThemedText role="heading" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>
            {reason}
          </ThemedText>
        </View>
      </View>

      {permission.granted ? (
        <Button variant="secondary" isDisabled style={[styles.action, styles.allowed]}>
          <HugeiconsIcon icon={Tick02Icon} size={18} color={accent} />
          <ThemedText type="smallBold">Allowed</ThemedText>
        </Button>
      ) : isBlocked ? (
        <>
          <ThemedText role="alert" style={styles.description}>
            {Platform.OS === 'web'
              ? `The ${name} is blocked for this site. Allow it in your browser's site settings, then reload.`
              : `The ${name} is turned off for PawPin. Turn it on in your phone's settings.`}
          </ThemedText>
          {/* A web page cannot open the browser's settings. */}
          {Platform.OS !== 'web' && (
            <Button
              variant="secondary"
              style={styles.action}
              onPress={() => Linking.openSettings()}>
              Open settings
            </Button>
          )}
        </>
      ) : (
        <Button style={styles.action} onPress={onAllow}>
          {`Allow ${name}`}
        </Button>
      )}
    </View>
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
  // Same column as the Profile tab, so the tabs share one left and right edge.
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
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
  },
  row: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  icon: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: 400,
  },
  allowed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  action: {
    width: '100%',
    minHeight: 48,
    borderRadius: Spacing.three,
  },
});
