import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Camera, Map } from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import { Alert, Button, Input, Label, RadioGroup, TextField, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  ANIMAL_TYPES,
  CONDITIONS,
  POOR_ACCURACY_M,
  SIZES,
  URGENCIES,
  type ReportDraft,
} from '@/lib/reports';

// Free OpenStreetMap tiles. No key and no account.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
/** Close enough to tell one gate or corner from the next. */
const STREET_ZOOM = 17;
const MAP_HEIGHT = 220;
const COLOR_MAX_LENGTH = 40;
const LANDMARK_MAX_LENGTH = 120;

type Option = { value: string; label: string };

function labelOf(options: readonly Option[], value: string | null) {
  return options.find((option) => option.value === value)?.label ?? 'Not given';
}

type ReportFormProps = {
  draft: ReportDraft;
  onRetake: () => void;
};

/** The reporter checks the pin, then says what the animal is and how fast help is needed. */
export function ReportForm({ draft: fromCamera, onRetake }: ReportFormProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(fromCamera);
  const [mapFailed, setMapFailed] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const update = (changes: Partial<ReportDraft>) => setDraft({ ...draft, ...changes });
  const canSubmit = draft.animalType !== '' && draft.urgency !== null;
  // Judged on the reading from the camera, so the notice does not vanish once the pin is moved.
  const isRough = fromCamera.accuracyM != null && fromCamera.accuracyM > POOR_ACCURACY_M;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <View style={styles.column}>
          <ThemedText type="smallBold" role="heading" style={styles.heading}>
            Where is the animal?
          </ThemedText>

          {isRough && (
            <Alert status="warning" style={styles.notice}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Check the pin</Alert.Title>
                <Alert.Description>
                  Location may be off by about {Math.round(fromCamera.accuracyM ?? 0)} m. Move the
                  map until the pin is on the exact spot.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {mapFailed ? (
            <ThemedView type="backgroundElement" role="alert" style={[styles.map, styles.mapMessage]}>
              <ThemedText type="small" style={styles.centered}>
                The map could not load. The location from your photo is still saved.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.map}>
              <Map
                style={styles.container}
                mapStyle={MAP_STYLE}
                compass={false}
                logo={false}
                touchRotate={false}
                touchPitch={false}
                onDidFailLoadingMap={() => setMapFailed(true)}
                onRegionDidChange={(event) => {
                  const { center, userInteraction } = event.nativeEvent;
                  // The map also reports its own first placement; only the reporter's moves count.
                  if (userInteraction) update({ longitude: center[0], latitude: center[1] });
                }}>
                {/* The map library takes longitude first. */}
                <Camera
                  initialViewState={{
                    center: [fromCamera.longitude, fromCamera.latitude],
                    zoom: STREET_ZOOM,
                  }}
                />
              </Map>
              {/* The pin never moves; the map slides under it. Its tip marks the exact middle. */}
              <View pointerEvents="none" style={styles.pinLayer}>
                <View style={styles.pin}>
                  <View style={styles.pinHead} />
                  <View style={styles.pinStem} />
                </View>
              </View>
            </View>
          )}

          <ThemedText type="small" themeColor="textSecondary">
            Move the map until the pin is on the exact spot.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            © OpenStreetMap contributors
          </ThemedText>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.column, styles.fields]}>
          <View style={styles.photos}>
            {draft.photos.map((photo) => (
              <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.photo} />
            ))}
          </View>

          <ThemedText type="smallBold" role="heading">
            About the animal
          </ThemedText>

          <Choice
            label="Animal"
            isRequired
            options={ANIMAL_TYPES}
            value={draft.animalType}
            onChange={(animalType) => update({ animalType })}
          />
          <Choice
            label="How urgent"
            isRequired
            options={URGENCIES}
            value={draft.urgency ?? ''}
            onChange={(value) =>
              update({ urgency: URGENCIES.find((urgency) => urgency.value === value)?.value ?? null })
            }
          />
          <Choice
            label="Condition"
            options={CONDITIONS}
            value={draft.condition}
            onChange={(condition) => update({ condition })}
          />
          <Choice
            label="Size"
            options={SIZES}
            value={draft.size}
            onChange={(size) => update({ size })}
          />

          <TextField>
            <Label>Color</Label>
            <Input
              value={draft.color}
              onChangeText={(color) => update({ color })}
              maxLength={COLOR_MAX_LENGTH}
              placeholder="Brown with white paws"
            />
          </TextField>
          <TextField>
            <Label>Landmark</Label>
            <Input
              value={draft.landmark}
              onChangeText={(landmark) => update({ landmark })}
              maxLength={LANDMARK_MAX_LENGTH}
              placeholder="Near the blue gate beside the bakery"
            />
          </TextField>

          {!canSubmit && (
            <ThemedText type="small" themeColor="textSecondary">
              Choose the animal and how urgent it is to continue.
            </ThemedText>
          )}
          <View style={styles.actions}>
            <Button variant="secondary" onPress={onRetake}>
              Retake
            </Button>
            <Button isDisabled={!canSubmit} onPress={() => setShowSummary(true)}>
              Submit
            </Button>
          </View>

          {showSummary && (
            // Stand-in until the report is really sent: shows what would be saved.
            <ThemedView type="backgroundElement" style={styles.summary}>
              <ThemedText type="smallBold">Not sent yet. This is what will be saved:</ThemedText>
              <ThemedText type="small">Animal: {labelOf(ANIMAL_TYPES, draft.animalType)}</ThemedText>
              <ThemedText type="small">Urgency: {labelOf(URGENCIES, draft.urgency)}</ThemedText>
              <ThemedText type="small">Condition: {labelOf(CONDITIONS, draft.condition)}</ThemedText>
              <ThemedText type="small">Size: {labelOf(SIZES, draft.size)}</ThemedText>
              <ThemedText type="small">Color: {draft.color.trim() || 'Not given'}</ThemedText>
              <ThemedText type="small">Landmark: {draft.landmark.trim() || 'Not given'}</ThemedText>
              <ThemedText type="small">Latitude: {draft.latitude}</ThemedText>
              <ThemedText type="small">Longitude: {draft.longitude}</ThemedText>
              <ThemedText type="small">
                Accuracy:{' '}
                {draft.accuracyM == null ? 'not known' : `about ${Math.round(draft.accuracyM)} m`}
              </ThemedText>
              <ThemedText type="small">
                Photo taken: {new Date(draft.photos[0].takenAt).toLocaleString()}
              </ThemedText>
            </ThemedView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

type ChoiceProps = {
  label: string;
  isRequired?: boolean;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
};

/** One question with a few answers, laid out side by side so four questions fit on one screen. */
function Choice({ label, isRequired, options, value, onChange }: ChoiceProps) {
  const [accent, accentForeground, border, foreground] = useThemeColor([
    'accent',
    'accent-foreground',
    'border',
    'foreground',
  ]);

  return (
    <View style={styles.choice}>
      <ThemedText type="small">
        {label}
        {isRequired ? ' (required)' : ''}
      </ThemedText>
      <RadioGroup
        aria-label={label}
        value={value || undefined}
        onValueChange={onChange}
        className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <RadioGroup.Item key={option.value} value={option.value}>
            {({ isSelected }) => (
              <View
                style={[
                  styles.pill,
                  {
                    borderColor: isSelected ? accent : border,
                    backgroundColor: isSelected ? accent : 'transparent',
                  },
                ]}>
                {/* The tick marks the choice for people who cannot tell it by color. */}
                {isSelected && <HugeiconsIcon icon={Tick02Icon} size={16} color={accentForeground} />}
                <Text style={[styles.pillLabel, { color: isSelected ? accentForeground : foreground }]}>
                  {option.label}
                </Text>
              </View>
            )}
          </RadioGroup.Item>
        ))}
      </RadioGroup>
    </View>
  );
}

const PIN_HEAD = 22;
const PIN_STEM = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the Profile tab.
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  heading: {
    marginTop: Spacing.three,
  },
  notice: {
    marginBottom: Spacing.one,
  },
  map: {
    height: MAP_HEIGHT,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  mapMessage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  pinLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lifted by half its height so the bottom of the stem, not the middle of the pin, is on the spot.
  pin: {
    alignItems: 'center',
    transform: [{ translateY: -(PIN_HEAD + PIN_STEM) / 2 }],
  },
  // Fixed colors, not theme colors: the map is light in both light and dark mode.
  pinHead: {
    width: PIN_HEAD,
    height: PIN_HEAD,
    borderRadius: PIN_HEAD / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#C62828',
  },
  pinStem: {
    width: 3,
    height: PIN_STEM,
    backgroundColor: '#1F1F1F',
  },
  fields: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
  },
  photos: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
  choice: {
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    // 44 px tall: the smallest size a thumb hits reliably.
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: 22,
  },
  pillLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 500,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  summary: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
