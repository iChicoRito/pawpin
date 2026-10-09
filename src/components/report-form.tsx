import { Camera, Map } from '@maplibre/maplibre-react-native';
import {
  Alert,
  Button,
  Card,
  Description,
  FieldError,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  TagGroup,
  TextField,
  useThemeColor,
  useToast,
} from 'heroui-native';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PhotoThumb } from '@/components/report-photo';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ReportSent, ToastIcon } from '@/components/report-sent';
import { useSession } from '@/hooks/use-session';
import { mapInkFor, mapStyleFor, STREET_ZOOM } from '@/lib/map';
import {
  ANIMAL_TYPES,
  COLORS,
  CONDITIONS,
  GUEST_LIMIT_ERROR,
  POOR_ACCURACY_M,
  saveUnsentReport,
  SIZES,
  submitReport,
  URGENCIES,
  type ReportDraft,
} from '@/lib/reports';

const MAP_HEIGHT = 200;
const OTHER_MAX_LENGTH = 40;
const COLOR_MAX_LENGTH = 40;
const LANDMARK_MAX_LENGTH = 120;

type Option = { value: string; label: string; hint?: string };

type ReportFormProps = {
  draft: ReportDraft;
  /** Drops this report and goes back to the camera. Also used after a report is sent. */
  onRetake: () => void;
  /** The send failed and the report is now kept on the phone. */
  onUnsent: (kept: ReportDraft) => void;
};

type SendStatus = 'idle' | 'sending' | 'sent' | 'limit' | 'failed';

/** The reporter checks the pin, then says what the animal is and how fast help is needed. */
export function ReportForm({ draft: fromCamera, onRetake, onUnsent }: ReportFormProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(fromCamera);
  const [mapFailed, setMapFailed] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const { session } = useSession();
  const [status, setStatus] = useState<SendStatus>('idle');
  const [border, accentForeground] = useThemeColor(['border', 'accent-foreground']);
  const isDark = useColorScheme() === 'dark';

  const update = (changes: Partial<ReportDraft>) => setDraft({ ...draft, ...changes });
  const isSending = status === 'sending';
  const { toast } = useToast();
  const scroll = useRef<ScrollView>(null);
  // How far down the page the first card starts. The map above it scrolls with the page.
  const firstCardY = useRef(0);
  // Problems are worked out all the time but only shown after the first press on Submit.
  const [wasTried, setWasTried] = useState(false);
  const problems = {
    animal: draft.animalType === '' ? 'Choose the animal.' : undefined,
    other:
      draft.animalType === 'other' && !draft.otherAnimal?.trim()
        ? 'Type what kind of animal it is.'
        : undefined,
    urgency: draft.urgency === null ? 'Choose how urgent it is.' : undefined,
    color: draft.color === 'other' && !draft.otherColor?.trim() ? 'Type the color.' : undefined,
  };
  const errors: Partial<typeof problems> = wasTried ? problems : {};

  async function send() {
    if (!session) return;
    if (problems.animal || problems.other || problems.urgency) {
      setWasTried(true);
      // These fields are in the first card.
      scroll.current?.scrollTo({ y: firstCardY.current });
      return;
    }
    if (problems.color) {
      setWasTried(true);
      return;
    }
    setStatus('sending');
    try {
      await submitReport(draft, session.user.id);
      toast.show({
        variant: 'success',
        label: 'Report sent',
        icon: <ToastIcon status="success" />,
      });
      setStatus('sent');
    } catch (error) {
      if (error instanceof Error && error.message === GUEST_LIMIT_ERROR) {
        toast.show({
          variant: 'danger',
          icon: <ToastIcon status="danger" />,
          label: 'Report not sent',
          description: 'Guests can send 3 reports in 24 hours.',
        });
        setStatus('limit');
        return;
      }
      console.warn('Sending the report failed:', error);
      try {
        const kept = await saveUnsentReport(draft, session.user.id);
        toast.show({
          variant: 'danger',
          icon: <ToastIcon status="danger" />,
          label: 'Report not sent',
          description: 'It is saved on this phone.',
        });
        onUnsent(kept);
      } catch (saveError) {
        // Could not keep it either. The form stays filled in so Submit can be tried again.
        console.warn('Keeping the report on the phone failed:', saveError);
        toast.show({
          variant: 'danger',
          icon: <ToastIcon status="danger" />,
          label: 'Report not sent',
          description: 'Check your connection and try again.',
        });
        setStatus('failed');
      }
    }
  }

  if (status === 'sent') return <ReportSent draft={draft} onDone={onRetake} />;

  // Judged on the reading from the camera, so the notice does not vanish once the pin is moved.
  const isRough = fromCamera.accuracyM != null && fromCamera.accuracyM > POOR_ACCURACY_M;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.column, styles.fields]}>
          <View style={styles.intro}>
            <ThemedText role="heading" style={styles.title}>
              Where is the animal?
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
              Move the map until the pin is on the exact spot.
            </ThemedText>
          </View>

          {isRough && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Check the pin</Alert.Title>
                <Alert.Description>
                  Location may be off by about {Math.round(fromCamera.accuracyM ?? 0)} m.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {mapFailed ? (
            <ThemedView
              type="backgroundElement"
              role="alert"
              style={[styles.map, styles.mapMessage, { borderColor: border }]}>
              <ThemedText type="small" style={styles.centered}>
                The map could not load. The location from your photo is still saved.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={[styles.map, { borderColor: border }]}>
              <Map
                style={styles.container}
                mapStyle={mapStyleFor(isDark)}
                compass={false}
                logo={false}
                touchRotate={false}
                touchPitch={false}
                onDidFailLoadingMap={() => setMapFailed(true)}
                onDidFinishLoadingMap={() => setIsMapReady(true)}
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
              {/* Covers the empty grey box until the streets are drawn. */}
              {!isMapReady && <Skeleton className="absolute inset-0" />}
              {/* The pin never moves; the map slides under it. Its tip marks the exact middle. */}
              <View pointerEvents="none" style={styles.pinLayer}>
                <View style={styles.pin}>
                  <View style={styles.pinHead} />
                  {/* The stem is dark on the light map and white on the dark one. */}
                  <View style={[styles.pinStem, { backgroundColor: mapInkFor(isDark).ink }]} />
                </View>
              </View>
              <Text style={styles.credit}>© OpenStreetMap contributors</Text>
            </View>
          )}

          <View
            role="group"
            aria-label={draft.photos.length === 1 ? '1 photo' : `${draft.photos.length} photos`}
            style={styles.photos}>
            {draft.photos.map((photo, index) => (
              <PhotoThumb
                key={photo.uri}
                uri={photo.uri}
                label={`Photo ${index + 1}`}
                style={styles.photo}
              />
            ))}
          </View>

          <Card
            variant="default"
            style={styles.card}
            onLayout={(event) => {
              firstCardY.current = event.nativeEvent.layout.y;
            }}>
            <View style={styles.cardHead}>
              <Card.Title role="heading">About the animal</Card.Title>
              <Card.Description>Rescuers use this to decide how fast to come.</Card.Description>
            </View>
            <Choice
              label="Animal"
              kind="segments"
              isRequired
              options={ANIMAL_TYPES}
              value={draft.animalType}
              onChange={(animalType) => update({ animalType })}
              error={errors.animal}
            />
            {draft.animalType === 'other' && (
              <TextField isRequired isInvalid={!!errors.other}>
                <Label>What kind of animal?</Label>
                <Input
                  variant="secondary"
                  value={draft.otherAnimal ?? ''}
                  onChangeText={(otherAnimal) => update({ otherAnimal })}
                  maxLength={OTHER_MAX_LENGTH}
                  placeholder="Rabbit"
                />
                {errors.other && <FieldError>{errors.other}</FieldError>}
              </TextField>
            )}
            <Choice
              label="How urgent"
              kind="list"
              isRequired
              options={URGENCIES}
              value={draft.urgency ?? ''}
              onChange={(value) =>
                update({
                  urgency: URGENCIES.find((urgency) => urgency.value === value)?.value ?? null,
                })
              }
              error={errors.urgency}
            />
          </Card>

          <Card variant="default" style={styles.card}>
            <View style={styles.cardHead}>
              <Card.Title role="heading">More details (optional)</Card.Title>
              <Card.Description>Helps rescuers recognise the animal.</Card.Description>
            </View>
            <Choice
              label="Condition"
              kind="tags"
              options={CONDITIONS}
              value={draft.condition}
              onChange={(condition) => update({ condition })}
            />
            <Choice
              label="Size"
              kind="segments"
              options={SIZES}
              value={draft.size}
              onChange={(size) => update({ size })}
            />
            <View style={styles.choice}>
              <ThemedText type="small">Color</ThemedText>
              <Select
                // Must be the same word as on Select.Content below, or HeroUI throws.
                presentation="bottom-sheet"
                value={COLORS.find((color) => color.value === draft.color)}
                onValueChange={(color) => update({ color: color?.value ?? '' })}>
                {/* On a card a field takes the grey fill, as Input does with variant="secondary".
                    Select has no such variant, so the same color is set by class. */}
                <Select.Trigger aria-label="Color" className="bg-default">
                  <Select.Value placeholder="Choose a color" />
                  <Select.TriggerIndicator />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Overlay />
                  <Select.Content presentation="bottom-sheet">
                    {COLORS.map((color) => (
                      <Select.Item key={color.value} value={color.value} label={color.label} />
                    ))}
                  </Select.Content>
                </Select.Portal>
              </Select>
            </View>
            {draft.color === 'other' && (
              <TextField isRequired isInvalid={!!errors.color}>
                <Label>What color?</Label>
                <Input
                  variant="secondary"
                  value={draft.otherColor ?? ''}
                  onChangeText={(otherColor) => update({ otherColor })}
                  maxLength={COLOR_MAX_LENGTH}
                  placeholder="Brown with white paws"
                />
                {errors.color && <FieldError>{errors.color}</FieldError>}
              </TextField>
            )}
            <TextField>
              <Label>Landmark</Label>
              <Input
                variant="secondary"
                value={draft.landmark}
                onChangeText={(landmark) => update({ landmark })}
                maxLength={LANDMARK_MAX_LENGTH}
                placeholder="Near the blue gate beside the bakery"
              />
            </TextField>
          </Card>

          {status === 'limit' && (
            <Alert status="danger" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  Guests can send 3 reports in 24 hours. Sign in with Google on the Profile tab to
                  send more.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {status === 'failed' && (
            <Alert status="danger" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  Could not send the report. Check your connection and try again.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <View style={styles.actions}>
            {/* Disabled while sending, so a second tap cannot send the report twice. */}
            <Button isDisabled={isSending} onPress={send}>
              {isSending && <Spinner size="sm" color={accentForeground} />}
              <Button.Label>{isSending ? 'Sending…' : 'Submit'}</Button.Label>
            </Button>
            <Button variant="secondary" isDisabled={isSending} onPress={onRetake}>
              Retake
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

type ChoiceProps = {
  label: string;
  /**
   * How the answers are drawn. `segments`: one bar split in equal parts, for a few short answers.
   * `list`: one answer per line with a line of help. `tags`: small pills that wrap.
   */
  kind: 'segments' | 'list' | 'tags';
  isRequired?: boolean;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  /** Shown under the answers when the question was left empty. */
  error?: string;
};

/** One question with a few answers. */
function Choice({ label, kind, isRequired, options, value, onChange, error }: ChoiceProps) {
  const danger = useThemeColor('danger');
  const name = isRequired ? `${label}, required` : label;

  return (
    <View style={styles.choice}>
      <ThemedText type="small">
        {label}
        {/* Same mark as HeroUI puts on a required text field. Screen readers get the word below. */}
        {isRequired && (
          <Text aria-hidden style={{ color: danger }}>
            {' *'}
          </Text>
        )}
      </ThemedText>

      {kind === 'segments' && (
        <Tabs aria-label={name} value={value} onValueChange={onChange}>
          {/* Stretched across the card, with every part the same width. */}
          <Tabs.List className="self-stretch">
            <Tabs.Indicator />
            {options.map((option) => (
              <Tabs.Trigger key={option.value} value={option.value} className="flex-1">
                <Tabs.Label>{option.label}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      {kind === 'list' && (
        <RadioGroup
          aria-label={name}
          value={value || undefined}
          onValueChange={onChange}
          isInvalid={!!error}
          className="gap-4">
          {options.map((option) => (
            <RadioGroup.Item key={option.value} value={option.value}>
              <View style={styles.container}>
                <Label>{option.label}</Label>
                {option.hint && <Description>{option.hint}</Description>}
              </View>
              <Radio />
            </RadioGroup.Item>
          ))}
        </RadioGroup>
      )}

      {kind === 'tags' && (
        <TagGroup
          aria-label={name}
          selectionMode="single"
          size="lg"
          selectedKeys={value ? [value] : []}
          // Tapping the chosen tag again clears it, which suits a question nobody has to answer.
          onSelectionChange={(keys) => onChange(String([...keys][0] ?? ''))}>
          <TagGroup.List>
            {options.map((option) => (
              <TagGroup.Item key={option.value} id={option.value}>
                {option.label}
              </TagGroup.Item>
            ))}
          </TagGroup.List>
        </TagGroup>
      )}

      {error && <FieldError isInvalid>{error}</FieldError>}
    </View>
  );
}

const PIN_HEAD = 22;
const PIN_STEM = 12;

const styles = StyleSheet.create({
  regular: {
    fontWeight: 400,
  },
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
  intro: {
    gap: Spacing.half,
  },
  // Same size as the name on the Profile tab.
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
  // The border keeps a pale map from running into a white page.
  map: {
    height: MAP_HEIGHT,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Fixed colors for the same reason as the pin.
  credit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderTopLeftRadius: Spacing.two,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    color: '#1F1F1F',
    fontSize: 11,
    lineHeight: 16,
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
  // Red with a white edge reads on the light and the dark map alike.
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
    paddingBottom: Spacing.three,
  },
  photos: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  // Same surface, padding, and corner as the cards on the Profile tab.
  // Padding, corner, and background come from HeroUI Card. The gap between questions is wider
  // than the gap inside one, so each reads as its own group.
  card: {
    gap: Spacing.four,
  },
  cardHead: {
    gap: Spacing.half,
  },
  actions: {
    gap: Spacing.two,
  },
  choice: {
    gap: Spacing.two,
  },
});
