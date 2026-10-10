import Call02Icon from '@hugeicons/core-free-icons/Call02Icon';
import Car01Icon from '@hugeicons/core-free-icons/Car01Icon';
import Door01Icon from '@hugeicons/core-free-icons/Door01Icon';
import DropletIcon from '@hugeicons/core-free-icons/DropletIcon';
import FirstAidKitIcon from '@hugeicons/core-free-icons/FirstAidKitIcon';
import HandIcon from '@hugeicons/core-free-icons/HandIcon';
import Hospital01Icon from '@hugeicons/core-free-icons/Hospital01Icon';
import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon';
import Timer01Icon from '@hugeicons/core-free-icons/Timer01Icon';
import TurtleIcon from '@hugeicons/core-free-icons/TurtleIcon';
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { Card, ListGroup, Separator, useThemeColor } from 'heroui-native';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

// The words live here, in the app. Changing them means a new build; move them to the database
// when they need to change without one. General advice, approved by the owner, not a vet's.

type Tip = { icon: IconSvgElement; title: string; text: string };

// In the order a rescuer meets them: getting near the animal, then the place around it.
const SECTIONS: readonly { heading: string; tips: readonly Tip[] }[] = [
  {
    heading: 'Going near',
    tips: [
      {
        icon: ViewIcon,
        title: 'Keep your distance at first',
        text: 'Watch how the animal behaves before you go near. A frightened or hurt animal may bite.',
      },
      {
        icon: TurtleIcon,
        title: 'Move slowly and stay low',
        text: 'No sudden moves, no loud voice. Do not stare it in the eyes or stand over it.',
      },
      {
        icon: Door01Icon,
        title: 'Do not corner it',
        text: 'Leave it a way out. An animal with no escape defends itself.',
      },
      {
        icon: HandIcon,
        title: 'Protect your hands',
        text: 'Use a towel, a blanket, or thick gloves if you must touch it.',
      },
    ],
  },
  {
    heading: 'Around you',
    tips: [
      {
        icon: Car01Icon,
        title: 'Watch the road',
        text: 'Many strays are near traffic. Do not chase an animal toward cars, and do not step into the road yourself.',
      },
      {
        icon: Moon02Icon,
        title: 'Never go alone at night',
        text: 'Or into a place that feels unsafe. Tell someone where you are going.',
      },
    ],
  },
];

// What to do about a bite, as three things in order. The middle one is a number, on purpose: it
// is the part people cut short.
const BITE_STEPS = [
  { icon: DropletIcon, big: null, label: 'Wash with soap and running water' },
  { icon: Timer01Icon, big: '15 min', label: 'Keep washing that long' },
  { icon: Hospital01Icon, big: null, label: 'Go to a clinic the same day' },
] as const;

const ICON_TILE = 40;

/**
 * How to go near a stray without getting hurt. Opened from the Profile tab, and from a report the
 * viewer is on the way to. Made to be glanced through, not read: each tip is an icon and a few
 * bold words first, the reason under them, and the one thing that can kill, a bite, is set apart
 * as steps. Nothing is read from the network, so it opens with no signal, which is where a rescuer
 * may be standing.
 */
export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const [accent, danger] = useThemeColor(['accent', 'danger']);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.opening}>
          <ThemedText role="heading" style={styles.lead}>
            A scared animal can hurt you.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.regular}>
            A minute here before you go near. General advice, not a vet’s.
          </ThemedText>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.heading} style={styles.section}>
            <ThemedText type="small" role="heading" themeColor="textSecondary">
              {section.heading}
            </ThemedText>
            {/* The same grouped list as the Profile tab's menu, to read and not to press. */}
            <ListGroup>
              {section.tips.map((tip, index) => (
                <Fragment key={tip.title}>
                  {index > 0 && <Separator className="mx-4" />}
                  <ListGroup.Item
                    pointerEvents="none"
                    accessible
                    aria-label={`${tip.title}. ${tip.text}`}
                    style={styles.row}>
                    <ListGroup.ItemPrefix>
                      <IconTile icon={tip.icon} color={accent} />
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>{tip.title}</ListGroup.ItemTitle>
                      <ListGroup.ItemDescription>{tip.text}</ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                  </ListGroup.Item>
                </Fragment>
              ))}
            </ListGroup>
          </View>
        ))}

        <View style={styles.section}>
          <ThemedText type="small" role="heading" themeColor="textSecondary">
            If something goes wrong
          </ThemedText>

          {/* The one tip set apart, in red: a bite left alone can kill. */}
          <Card
            variant="default"
            accessible
            aria-label="If you are bitten or scratched. Wash the wound with soap and running water for 15 minutes, and go to a clinic the same day. Rabies is deadly, and the shots work only when given early."
            style={styles.card}>
            <View style={styles.cardHeading}>
              <IconTile icon={FirstAidKitIcon} color={danger} />
              <ThemedText style={styles.cardTitle}>If you are bitten or scratched</ThemedText>
            </View>
            {/* One under the other, in the order to do them: the number, what to do, and for the
                middle one how long, large at the end of its line. */}
            <View style={styles.steps}>
              {BITE_STEPS.map((step, index) => (
                <ThemedView key={step.label} type="backgroundElement" style={styles.step}>
                  <ThemedText themeColor="textSecondary" style={styles.stepNumber}>
                    {index + 1}
                  </ThemedText>
                  <HugeiconsIcon icon={step.icon} size={20} color={danger} />
                  <ThemedText type="small" style={styles.stepLabel}>
                    {step.label}
                  </ThemedText>
                  {step.big && <ThemedText style={styles.stepBig}>{step.big}</ThemedText>}
                </ThemedView>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
              Rabies is deadly, and the shots work only when given early.
            </ThemedText>
          </Card>

          <Card
            variant="default"
            accessible
            aria-label="If the animal is badly hurt or aggressive, do not try alone. Call your city’s veterinary office or a local rescue group."
            style={styles.card}>
            <View style={styles.cardHeading}>
              <IconTile icon={Call02Icon} color={accent} />
              <View style={styles.cardWords}>
                <ThemedText style={styles.cardTitle}>
                  Badly hurt or aggressive? Not alone.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
                  Call your city’s veterinary office or a local rescue group.
                </ThemedText>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/** An icon on a faint tile of its own color. */
function IconTile({ icon, color }: { icon: IconSvgElement; color: string }) {
  return (
    <View aria-hidden style={styles.iconTile}>
      {/* Theme colors come in more than one notation, so the tint is a see-through layer. */}
      <View style={[StyleSheet.absoluteFill, styles.iconTint, { backgroundColor: color }]} />
      <HugeiconsIcon icon={icon} size={22} color={color} strokeWidth={1.8} />
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
  regular: {
    fontWeight: 400,
  },
  opening: {
    gap: Spacing.one,
  },
  // The one large line on the page: why to read on.
  lead: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  // A heading sits closer to its own list than to the section before it.
  section: {
    gap: Spacing.two,
  },
  // The icon stays level with the title, however many lines the reason runs to.
  row: {
    alignItems: 'flex-start',
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconTint: {
    opacity: 0.12,
  },
  // Surface and corner come from HeroUI Card, as on the Profile tab.
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardWords: {
    flex: 1,
    gap: Spacing.half,
  },
  cardTitle: {
    flex: 1,
    fontWeight: 600,
  },
  steps: {
    gap: Spacing.two,
  },
  // One line each: the number, the icon, the words, and room at the end for "15 min".
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    padding: Spacing.two + Spacing.one,
    borderRadius: 12,
  },
  // Takes what is left, so long words wrap instead of pushing the time off the card.
  stepLabel: {
    flex: 1,
    fontWeight: 400,
  },
  stepNumber: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  stepBig: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
});
