import Notification01Icon from '@hugeicons/core-free-icons/Notification01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Button, Card, Separator, Spinner, useThemeColor } from 'heroui-native';
import { Fragment, useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PermissionRow } from '@/components/report-permissions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import {
  fetchAlertRadius,
  registerForAlerts,
  saveAlertRadius,
  useAlertPermission,
} from '@/lib/alerts';
import { RADIUS_CHOICES } from '@/lib/nearby';

const RADIO_SIZE = 22;

/**
 * Alerts about strays reported nearby: the phone's permission, with the reason before the phone
 * asks, and how far away a report may be and still alert this user. Opened from the Profile tab
 * and from the card on the Map. Phones only; browsers get alerts.web.tsx.
 */
export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const userId = useSession().session?.user.id;
  const [permission, requestPermission] = useAlertPermission();
  const [accent, accentForeground, muted] = useThemeColor(['accent', 'accent-foreground', 'muted']);
  // `null` until the saved distance is read.
  const [radiusM, setRadiusM] = useState<number | null>(null);
  const [failure, setFailure] = useState<'load' | 'save' | null>(null);

  function load(id: string) {
    fetchAlertRadius(id)
      .then((saved) => {
        setRadiusM(saved);
        setFailure(null);
      })
      .catch((error) => {
        console.warn('Loading the alert distance failed:', error);
        setFailure('load');
      });
  }

  useEffect(() => {
    if (userId) load(userId);
  }, [userId]);

  async function choose(next: number) {
    if (!userId || radiusM === null || next === radiusM) return;
    const before = radiusM;
    // Shown at once; put back if the database did not keep it.
    setRadiusM(next);
    setFailure(null);
    try {
      await saveAlertRadius(userId, next);
    } catch (error) {
      console.warn('Saving the alert distance failed:', error);
      setRadiusM(before);
      setFailure('save');
    }
  }

  async function allow() {
    const answer = await requestPermission();
    // The phone's pass can only be made once the answer is yes.
    if (answer.granted && userId) registerForAlerts(userId);
    return answer;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <Section title="Notifications">
          <Card variant="default" style={styles.surface}>
            {permission ? (
              <PermissionRow
                icon={Notification01Icon}
                name="notifications"
                title="Notifications"
                reason="To tell you when a stray is reported near you."
                permission={permission}
                onAllow={allow}
              />
            ) : (
              <View style={styles.reading}>
                <Spinner size="sm" />
              </View>
            )}
          </Card>
        </Section>

        <Section title="Alert distance">
          <Card variant="default" style={styles.surface}>
            {/* One of four: read out as a group of choices, each saying whether it is chosen. */}
            <View role="radiogroup" aria-label="Alert distance">
              {RADIUS_CHOICES.map((choice, index) => {
                const isChosen = choice.value === radiusM;
                return (
                  <Fragment key={choice.value}>
                    {index > 0 && <Separator className="mx-4" />}
                    <Pressable
                      role="radio"
                      aria-checked={isChosen}
                      aria-label={`Within ${choice.label}`}
                      // Nothing to choose between until the saved distance is known.
                      disabled={radiusM === null}
                      onPress={() => choose(choice.value)}
                      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
                      <ThemedText style={isChosen ? styles.labelChosen : styles.label}>
                        Within {choice.label}
                      </ThemedText>
                      <View
                        style={[
                          styles.radio,
                          isChosen
                            ? { backgroundColor: accent }
                            : { borderWidth: 1.5, borderColor: muted },
                        ]}>
                        {isChosen && (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            size={14}
                            color={accentForeground}
                            strokeWidth={2.5}
                          />
                        )}
                      </View>
                    </Pressable>
                  </Fragment>
                );
              })}
            </View>
          </Card>

          {failure === 'load' ? (
            <View role="alert" style={styles.failure}>
              <ThemedText type="small" style={styles.regular}>
                Could not load your alert distance. Check your connection.
              </ThemedText>
              <Button variant="secondary" size="sm" onPress={() => userId && load(userId)}>
                Try again
              </Button>
            </View>
          ) : (
            <>
              {failure === 'save' && (
                <ThemedText type="small" role="alert" style={styles.regular}>
                  Could not save that distance. Check your connection and choose it again.
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
                You are alerted about strays reported within this distance of where you last opened
                PawPin.
              </ThemedText>
            </>
          )}
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

/** A group with its name over it, as on the Settings screen. */
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" role="heading" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the Settings and Appearance screens.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  // Surface and corner come from HeroUI Card. The rows inside bring their own padding.
  surface: {
    padding: 0,
  },
  // As tall as the row that replaces it is at its shortest, so the page does not jump much.
  reading: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A full-width row, tall enough for a thumb.
  choice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: RADIO_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: 500,
  },
  labelChosen: {
    fontWeight: 600,
  },
  regular: {
    fontWeight: 400,
  },
  failure: {
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
