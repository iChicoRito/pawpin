import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Location01Icon from '@hugeicons/core-free-icons/Location01Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Button, Spinner, useThemeColor } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHideTabBar } from '@/components/app-tabs';
import { PhotoThumb } from '@/components/report-photo';
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
// Three of these and the shutter fit side by side on a 360 px wide phone.
const THUMB_SIZE = 36;
// Controls lie on top of the picture, so their colors are fixed: white on a dark veil reads over
// anything the camera is pointed at, in light and dark mode alike.
const ON_PICTURE = '#FFFFFF';
const VEIL = 'rgba(0, 0, 0, 0.6)';

/** Takes up to three photos. The first one fixes the report's place and time. */
export function ReportCamera({ onDone }: { onDone: (draft: ReportDraft) => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Tabs stay mounted, so without this the camera and GPS would keep running on the other tabs.
  const isFocused = useIsFocused();
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The camera takes the whole screen. The close button below is the way out while the bar is gone.
  useHideTabBar(isFocused);

  const photos = draft?.photos ?? [];
  const isFull = photos.length >= MAX_PHOTOS;

  function addPhoto(photo: ReportPhoto) {
    // Later photos are of the same animal in the same place, so only the first sets the place.
    setDraft(draft ? { ...draft, photos: [...draft.photos, photo] } : startDraft(photo));
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        // A new key starts the camera and the location reading from nothing.
        <Viewfinder
          key={attempt}
          photos={photos}
          isFull={isFull}
          onCapture={addPhoto}
          onRetry={() => setAttempt(attempt + 1)}
          next={draft && <Button onPress={() => onDone(draft)}>Next</Button>}
        />
      )}

      <View style={[styles.topBar, { top: insets.top + Spacing.two }]}>
        <Pressable
          role="button"
          aria-label="Close camera"
          onPress={() => router.navigate('/')}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <HugeiconsIcon icon={Cancel01Icon} size={22} color={ON_PICTURE} />
        </Pressable>
        {draft && (
          <Button variant="tertiary" onPress={() => setDraft(null)}>
            Start over
          </Button>
        )}
      </View>
    </View>
  );
}

type ViewfinderProps = {
  photos: ReportPhoto[];
  isFull: boolean;
  onCapture: (photo: ReportPhoto) => void;
  onRetry: () => void;
  /** The Next button, once a photo exists. Shown in the failure view too. */
  next: React.ReactNode;
};

function Viewfinder({ photos, isFull, onCapture, onRetry, next }: ViewfinderProps) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const accent = useThemeColor('accent');
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
      <ThemedView type="backgroundElement" role="alert" style={[styles.fill, styles.message]}>
        <ThemedText style={styles.messageText}>
          {failure === 'location'
            ? 'Could not read your location. Turn on location and move to open sky, then try again.'
            : 'The camera could not start.'}
        </ThemedText>
        <Button onPress={onRetry}>Try again</Button>
        {/* Photos already taken can still be sent. */}
        {next}
      </ThemedView>
    );
  }

  const canShoot = !!reading && isCameraReady && !isTaking && !isFull;
  const accuracy = reading?.coords.accuracy;

  return (
    <>
      {/* The clock and battery icons sit on the picture too. */}
      <StatusBar style="light" />
      <CameraView
        ref={camera}
        style={styles.fill}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
        onMountError={(event) => {
          console.warn('Camera failed to start:', event.message);
          setFailure('camera');
        }}
      />

      {!isCameraReady && (
        <View pointerEvents="none" style={[styles.fill, styles.starting]}>
          <Spinner size="lg" color={ON_PICTURE} />
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.column}>
          <View style={styles.statusRow}>
            {reading ? (
              <HugeiconsIcon icon={Location01Icon} size={18} color={ON_PICTURE} />
            ) : (
              <Spinner size="sm" color={ON_PICTURE} />
            )}
            <Text aria-live="polite" style={styles.status}>
              {!reading
                ? 'Finding your location…'
                : accuracy == null
                  ? 'Location found.'
                  : `Location found, accurate to about ${Math.round(accuracy)} m.`}
            </Text>
          </View>

          <View style={styles.shutterRow}>
            {/* All three places are drawn from the start, so the count shows without reading. */}
            <View
              role="group"
              aria-label={`${photos.length} of ${MAX_PHOTOS} photos`}
              style={styles.side}>
              {Array.from({ length: MAX_PHOTOS }, (_, index) =>
                photos[index] ? (
                  <PhotoThumb
                    key={index}
                    uri={photos[index].uri}
                    label={`Photo ${index + 1}`}
                    style={styles.thumb}
                  />
                ) : (
                  <View key={index} style={[styles.thumb, styles.slot]} />
                )
              )}
            </View>
            <Pressable
              role="button"
              aria-label="Take photo"
              aria-disabled={!canShoot}
              disabled={!canShoot}
              onPress={capture}
              style={({ pressed }) => [
                styles.shutter,
                !canShoot && styles.shutterOff,
                pressed && styles.pressed,
              ]}>
              <View style={[styles.shutterDot, { backgroundColor: accent }]} />
            </Pressable>
            {/* Empty twin of the previews column, so the shutter sits in the true middle. */}
            <View style={styles.side} />
          </View>

          {/* Its own row, so the button runs the full width under the shutter. */}
          {next}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Black behind the picture, like any camera.
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  topBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VEIL,
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.three,
    backgroundColor: VEIL,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  status: {
    flexShrink: 1,
    color: ON_PICTURE,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  starting: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Spacing.two,
  },
  slot: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 3,
    borderColor: ON_PICTURE,
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
});
