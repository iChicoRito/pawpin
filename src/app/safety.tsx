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
        text: 'Watch it before you go near. A scared or hurt animal may bite.',
      },
      {
        icon: TurtleIcon,
        title: 'Move slowly and stay low',
        text: 'No sudden moves or loud voice. Do not stare or stand over it.',
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
        text: 'Do not chase it toward cars or step into the road yourself.',
      },
      {
        icon: Moon02Icon,
        title: 'Never go alone at night',
        text: 'Or to a place that feels unsafe. Tell someone where you go.',
      },
    ],
  },
];

// What to do about a bite, as three things in order.
const BITE_STEPS = [
  { icon: DropletIcon, label: 'Wash with soap and running water' },
  { icon: Timer01Icon, label: 'Keep washing for 15 minutes' },
  { icon: Hospital01Icon, label: 'Go to a clinic the same day' },
] as const;

const ICON_TILE = 40;
const STEP_MARK = 28;

/**
 * How to go near a stray without getting hurt. Opened from the Profile tab, and from a report the
 * viewer is on the way to. Made to be glanced through, not read: each tip is an icon and a few
 * bold words first, the reason under them, and the one thing that can kill, a bite, is set apart
 * as steps. Nothing is read from the network, so it opens with no signal, which is where a rescuer
 * may be standing.
 */
export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const [muted, danger] = useThemeColor(['muted', 'danger']);

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
                      <IconTile icon={tip.icon} color={muted} />
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
            {/* Same shape as a tip above: the icon, the bold words, the reason under them. */}
            <View style={styles.cardHeading}>
              <IconTile icon={FirstAidKitIcon} color={danger} />
              <View style={styles.cardWords}>
                <ThemedText style={styles.cardTitle}>If you are bitten or scratched</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.regular}>
                  Rabies is deadly, and the shots work only when given early.
                </ThemedText>
              </View>
            </View>
            <Separator />
            {/* One under the other, joined by a line: the line is what says "in this order". The
                marks sit under the icon above, the words under the title. */}
            <View>
              {BITE_STEPS.map((step, index) => {
                const last = index === BITE_STEPS.length - 1;
                return (
                  <View key={step.label} style={styles.step}>
                    <View aria-hidden style={styles.stepRail}>
                      <View style={styles.stepMark}>
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            styles.iconTint,
                            { backgroundColor: danger },
                          ]}
                        />
                        <HugeiconsIcon
                          icon={step.icon}
                          size={16}
                          color={danger}
                          strokeWidth={1.8}
                        />
                      </View>
                      {!last && <View style={[styles.stepLine, { backgroundColor: danger }]} />}
                    </View>
                    <ThemedText type="small" style={[styles.stepLabel, !last && styles.stepGap]}>
                      {step.label}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </Card>

          <Card
            variant="default"
            accessible
            aria-label="If the animal is badly hurt or aggressive, do not try alone. Call your city’s veterinary office or a local rescue group."
            style={styles.card}>
            <View style={styles.cardHeading}>
              <IconTile icon={Call02Icon} color={muted} />
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
    fontWeight: 600,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  // As wide as the icon tile above, so the marks sit under its middle.
  stepRail: {
    width: ICON_TILE,
    alignItems: 'center',
  },
  stepMark: {
    width: STEP_MARK,
    height: STEP_MARK,
    borderRadius: STEP_MARK / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Fills whatever height the words beside it take, down to the next mark.
  stepLine: {
    flex: 1,
    width: 2,
    opacity: 0.25,
  },
  // Takes what is left, so long words wrap inside the card. The top padding puts a single line
  // level with the middle of its mark.
  stepLabel: {
    flex: 1,
    paddingTop: (STEP_MARK - 20) / 2,
  },
  // The space between steps is under the words, so the line beside them runs through it.
  stepGap: {
    paddingBottom: Spacing.three,
  },
});
