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
      <HugeiconsIcon icon={icon} size={22} color={foreground} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {reason}
        </ThemedText>

        {permission.granted ? (
          <View style={styles.allowed}>
            <HugeiconsIcon icon={Tick02Icon} size={18} color={accent} />
            <ThemedText type="small">Allowed</ThemedText>
          </View>
        ) : isBlocked ? (
          <>
            <ThemedText type="small" role="alert">
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
    borderRadius: Spacing.three,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.one,
  },
  allowed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
});
