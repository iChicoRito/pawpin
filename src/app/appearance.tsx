import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Card, useThemeColor } from 'heroui-native';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { APPEARANCES, setAppearance, useAppearance } from '@/lib/appearance';
import { URGENCY_COLORS } from '@/lib/nearby';

const RADIO_SIZE = 22;

type Palette = (typeof Colors)['light' | 'dark'];

/**
 * Light, dark, or the phone's own setting. Opened from the Profile tab. One card per choice, each
 * with a small picture of the app in that look, so it is seen before it is picked. The choice
 * applies at once.
 */
export default function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const appearance = useAppearance();
  const phoneIsDark = useColorScheme() === 'dark';
  const [accent, accentForeground, muted, border] = useThemeColor([
    'accent',
    'accent-foreground',
    'muted',
    'border',
  ]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>

        {/* One of three: read out as a group of choices, each saying whether it is the chosen one. */}
        <View role="radiogroup" aria-label="Appearance" style={styles.choices}>
          {APPEARANCES.map((option) => {
            const isChosen = option.value === appearance;
            return (
              <Pressable
                key={option.value}
                role="radio"
                aria-checked={isChosen}
                aria-label={`${option.label}. ${option.hint}`}
                onPress={() => setAppearance(option.value)}
                style={({ pressed }) => pressed && styles.pressed}>
                {/* The same HeroUI card as a report on the List: its surface, its corner. */}
                <Card variant="default" style={styles.choice}>
                  {/* The thin edge is the picture's own, so a white screen shows on a white page.
                    It does not mark the choice; the filled circle under it does. */}
                  <View style={[styles.preview, { borderColor: border }]}>
                    {option.value === 'system' ? (
                      // Half of each: it is whichever the phone is in.
                      <View style={styles.split}>
                        <View style={styles.half}>
                          <View style={styles.halfWide}>
                            <MiniScreen palette={Colors.light} accent={accent} />
                          </View>
                        </View>
                        <View style={styles.half}>
                          <View style={[styles.halfWide, styles.halfRight]}>
                            <MiniScreen palette={Colors.dark} accent={accent} />
                          </View>
                        </View>
                      </View>
                    ) : (
                      <MiniScreen palette={Colors[option.value]} accent={accent} />
                    )}
                  </View>

                  <View style={styles.text}>
                    <ThemedText style={isChosen ? styles.labelChosen : styles.label}>
                      {option.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {option.hint}
                      {option.value === 'system' &&
                        ` Your phone is in ${phoneIsDark ? 'dark' : 'light'} mode now.`}
                    </ThemedText>
                  </View>

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
                </Card>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/**
 * The app in miniature, in one look: a map with a paw's pin, a report card under it, the tab bar.
 * Drawn from the app's own colors, so the picture is what the choice gives.
 */
function MiniScreen({ palette, accent }: { palette: Palette; accent: string }) {
  return (
    <View aria-hidden style={[styles.mini, { backgroundColor: palette.background }]}>
      <View style={[styles.miniMap, { backgroundColor: palette.backgroundElement }]}>
        {/* Two streets and a pin, in the color of an urgent report. */}
        <View style={[styles.miniStreetAcross, { backgroundColor: palette.backgroundSelected }]} />
        <View style={[styles.miniStreetDown, { backgroundColor: palette.backgroundSelected }]} />
        <View style={[styles.miniPin, { backgroundColor: URGENCY_COLORS.critical }]} />
      </View>
      <View style={styles.miniCard}>
        <View style={[styles.miniPhoto, { backgroundColor: palette.backgroundSelected }]} />
        <View style={styles.miniLines}>
          <View style={[styles.miniLine, styles.miniLineLong, { backgroundColor: palette.text }]} />
          <View
            style={[
              styles.miniLine,
              styles.miniLineShort,
              { backgroundColor: palette.textSecondary },
            ]}
          />
        </View>
      </View>
      <View style={[styles.miniTabs, { borderTopColor: palette.backgroundSelected }]}>
        <View style={[styles.miniTab, { backgroundColor: accent }]} />
        <View style={[styles.miniTab, { backgroundColor: palette.backgroundSelected }]} />
        <View style={[styles.miniTab, { backgroundColor: palette.backgroundSelected }]} />
        <View style={[styles.miniTab, { backgroundColor: palette.backgroundSelected }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Same column as the Settings screen.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  // One under the other. The space between one card and the next.
  choices: {
    gap: Spacing.two,
  },
  // Surface and corner come from HeroUI Card. Laid out as a row: the picture, the words, and
  // the mark of the chosen one.
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  // Taller than wide, like the phone it stands for. Its corner is the card's less the padding.
  preview: {
    width: 68,
    aspectRatio: 3 / 4.4,
    borderRadius: Spacing.two + Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  half: {
    flex: 1,
    overflow: 'hidden',
  },
  // Each half draws the whole screen at full width and shows only its own side of it.
  halfWide: {
    width: '200%',
    height: '100%',
  },
  halfRight: {
    marginLeft: '-100%',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
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
  pressed: {
    opacity: 0.7,
  },
  mini: {
    flex: 1,
  },
  miniMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStreetAcross: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '62%',
    height: 4,
  },
  miniStreetDown: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '30%',
    width: 4,
  },
  // White edge, as the pins on the real map have.
  miniPin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    padding: Spacing.two,
  },
  miniPhoto: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  miniLines: {
    flex: 1,
    gap: 3,
  },
  miniLine: {
    height: 3,
    borderRadius: 1.5,
  },
  miniLineLong: {
    width: '80%',
    opacity: 0.85,
  },
  miniLineShort: {
    width: '50%',
    opacity: 0.7,
  },
  miniTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.one + Spacing.half,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  miniTab: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
