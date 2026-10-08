import { CameraView } from 'expo-camera';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useIsFocused } from 'expo-router';
import { Button, useThemeColor } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  MAX_PHOTOS,
  startDraft,
  type ReportDraft,
  type ReportPhoto,
} from '@/lib/reports';

/** How long to wait for the first location reading before saying it failed. */
const LOCATION_WAIT_MS = 20_000;
/** A reading older than this is not trusted. Readings arrive every second while the camera is open. */
const LOCATION_STALE_MS = 60_000;
const SHUTTER_SIZE = 72;
const THUMB_SIZE = 36;

/** Takes up to three photos. The first one fixes the report's place and time. */
export function ReportCamera({ onDone }: { onDone: (draft: ReportDraft) => void }) {
  const insets = useSafeAreaInsets();
  // Tabs stay mounted, so without this the camera and GPS would keep running on the other tabs.
  const isFocused = useIsFocused();
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [attempt, setAttempt] = useState(0);

  const photos = draft?.photos ?? [];
  const isFull = photos.length >= MAX_PHOTOS;

  function addPhoto(photo: ReportPhoto) {
    // Later photos are of the same animal in the same place, so only the first sets the place.
    setDraft(draft ? { ...draft, photos: [...draft.photos, photo] } : startDraft(photo));
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {isFocused ? (
        // A new key starts the camera and the location reading from nothing.
        <Viewfinder
          key={attempt}
          isFull={isFull}
          onCapture={addPhoto}
          onRetry={() => setAttempt(attempt + 1)}>
          {photos.map((photo) => (
            <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.thumb} />
          ))}
        </Viewfinder>
      ) : (
        <View style={styles.preview} />
      )}

      {draft && (
        <View style={styles.footer}>
          <ThemedText type="small" style={styles.count}>
            {photos.length} of {MAX_PHOTOS} photos
          </ThemedText>
          <Button variant="secondary" onPress={() => setDraft(null)}>
            Start over
          </Button>
          <Button onPress={() => onDone(draft)}>Next</Button>
        </View>
      )}
    </ThemedView>
  );
}

type ViewfinderProps = {
  isFull: boolean;
  onCapture: (photo: ReportPhoto) => void;
  onRetry: () => void;
  /** Small previews of the photos taken so far. */
  children: React.ReactNode;
};

function Viewfinder({ isFull, onCapture, onRetry, children }: ViewfinderProps) {
  const camera = useRef<CameraView>(null);
  const [foreground, accent] = useThemeColor(['foreground', 'accent']);
  const [reading, setReading] = useState<Location.LocationObject | null>(null);
  const [failure, setFailure] = useState<'location' | 'camera' | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTaking, setIsTaking] = useState(false);

  // The reading is kept warm while the camera is open. A photo then takes the reading already
  // in hand, instead of waiting several seconds for the phone to find itself after the tap.
  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let isGone = false;
    let hasReading = false;
    const fail = () => !isGone && !hasReading && setFailure('location');
    const timeout = setTimeout(fail, LOCATION_WAIT_MS);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
      (next) => {
        hasReading = true;
        setReading(next);
      }
    )
      .then((started) => {
        if (isGone) started.remove();
        else subscription = started;
      })
      .catch((error) => {
        console.warn('Reading location failed:', error);
        fail();
      });

    return () => {
      isGone = true;
      clearTimeout(timeout);
      subscription?.remove();
    };
  }, []);

  async function capture() {
    // Read the clock and the place first, at the tap, before the camera does its work.
    const now = Date.now();
    const isUsable =
      !!reading &&
      now - reading.timestamp < LOCATION_STALE_MS &&
      (await Location.hasServicesEnabledAsync());
    if (!isUsable) {
      // No photo is kept: a report with no place is of no use to a rescuer.
      setFailure('location');
      return;
    }
    const { latitude, longitude, accuracy } = reading.coords;

    setIsTaking(true);
    try {
      const picture = await camera.current?.takePictureAsync();
      if (picture) {
        onCapture({
          uri: picture.uri,
          takenAt: new Date(now).toISOString(),
          place: { latitude, longitude, accuracyM: accuracy },
        });
      }
    } catch (error) {
      console.warn('Taking the photo failed:', error);
      setFailure('camera');
    }
    setIsTaking(false);
  }

  if (failure) {
    return (
      <ThemedView type="backgroundElement" role="alert" style={[styles.preview, styles.message]}>
        <ThemedText style={styles.messageText}>
          {failure === 'location'
            ? 'Could not read your location. Turn on location and move to open sky, then try again.'
            : 'The camera could not start.'}
        </ThemedText>
        <Button onPress={onRetry}>Try again</Button>
      </ThemedView>
    );
  }

  const canShoot = !!reading && isCameraReady && !isTaking && !isFull;
  const accuracy = reading?.coords.accuracy;

  return (
    <>
      <CameraView
        ref={camera}
        style={styles.preview}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
        onMountError={(event) => {
          console.warn('Camera failed to start:', event.message);
          setFailure('camera');
        }}
      />

      <View style={styles.controls}>
        <ThemedText type="small" themeColor="textSecondary" aria-live="polite" style={styles.status}>
          {!reading
            ? 'Finding your location…'
            : accuracy == null
              ? 'Location found.'
              : `Location found, accurate to about ${Math.round(accuracy)} m.`}
        </ThemedText>

        <View style={styles.shutterRow}>
          <View style={styles.thumbs}>{children}</View>
          <Pressable
            role="button"
            aria-label="Take photo"
            aria-disabled={!canShoot}
            disabled={!canShoot}
            onPress={capture}
            style={({ pressed }) => [
              styles.shutter,
              { borderColor: foreground },
              !canShoot && styles.shutterOff,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.shutterDot, { backgroundColor: accent }]} />
          </Pressable>
          {/* Empty twin of the previews column, so the shutter sits in the true middle. */}
          <View style={styles.thumbs} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Black behind the picture, like any camera. Controls sit below it, never on top, so their
  // text keeps full contrast whatever the camera is pointed at.
  preview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  message: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  messageText: {
    textAlign: 'center',
    maxWidth: 320,
  },
  controls: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  status: {
    textAlign: 'center',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbs: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Spacing.two,
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDot: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: (SHUTTER_SIZE - 16) / 2,
  },
  shutterOff: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  count: {
    flex: 1,
  },
});
