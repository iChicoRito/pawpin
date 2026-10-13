import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { BANNER, type BannerPart } from '@/lib/banner-paths';
import { type Frame, watchSplashTarget } from '@/lib/splash-target';

// The banner's two colors: the same orange in both themes, the ink dark or white.
const ORANGE = '#F17D18';
const INK = { light: '#28272A', dark: '#FFFFFF' };

// Times in milliseconds. The same moves as the banner in the promo video, played faster.
const STEP = 130; // between one letter and the next
const PAD_AT = 680; // the paw drops onto the "i"
const WIPE_AT = 1040; // the tagline is wiped on
const WIPE_FOR = 520;
const HOLD = 2000; // the finished banner stays this long
const END = WIPE_AT + WIPE_FOR + HOLD;
const MOVE = 500; // the banner travels to the welcome screen's logo
const FADE = 250;
const EASE = Easing.bezier(0.22, 0.8, 0.2, 1);

type Spring = { damping: number; stiffness: number; mass: number };
const LETTER: Spring = { damping: 10, stiffness: 170, mass: 0.6 };
const PAD: Spring = { damping: 9, stiffness: 220, mass: 0.7 };
const TOE: Spring = { damping: 8, stiffness: 170, mass: 0.4 };

/** One shape of the banner, springing into its place after `delay`. */
function Part({
  part,
  k,
  color,
  delay,
  spring,
  rise = 0,
  from = 0,
  origin = '50% 100%',
  still,
}: {
  part: BannerPart;
  /** Screen points per unit of the banner's drawing. */
  k: number;
  color: string;
  delay: number;
  spring: Spring;
  /** How far below its place it starts, in the drawing's units. Negative starts above. */
  rise?: number;
  /** The size it starts at, where 1 is full size. */
  from?: number;
  origin?: string;
  /** Already in place: nothing moves. */
  still?: boolean;
}) {
  const [left, top, width, height] = part.box;
  const p = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!still) p.value = withDelay(delay, withSpring(1, spring));
  }, [p, delay, spring, still]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: [{ translateY: (1 - p.value) * rise * k }, { scale: from + (1 - from) * p.value }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: left * k, top: top * k, transformOrigin: origin },
        style,
      ]}>
      <Svg width={width * k} height={height * k} viewBox={part.box.join(' ')}>
        <Path d={part.d} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The PawPin banner, as wide as the screen allows up to 320. With `still` it is simply drawn;
 * without, it puts itself together: letters, then the paw, then the tagline. The splash and the
 * welcome screen both draw this one, so one can take the other's place unseen.
 */
export function Banner({ still }: { still?: boolean }) {
  const ink = useColorScheme() === 'dark' ? INK.dark : INK.light;
  const k = Math.max(0, Math.min(useWindowDimensions().width - Spacing.four * 2, 320)) / 735;
  const wipe = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!still) wipe.value = withDelay(WIPE_AT, withTiming(1, { duration: WIPE_FOR, easing: EASE }));
  }, [wipe, still]);
  const [left, top, width, height] = BANNER.tagline.box;
  const wipeStyle = useAnimatedStyle(() => ({ width: width * k * wipe.value }));

  return (
    <View style={{ width: 735 * k, height: 253 * k }}>
      {BANNER.letters.map((part, index) => (
        <Part
          key={index}
          still={still}
          part={part}
          k={k}
          color={index < 3 ? ink : ORANGE}
          delay={index * STEP}
          spring={LETTER}
          rise={90}
          from={0.6}
        />
      ))}
      <Part
        still={still}
        part={BANNER.pad}
        k={k}
        color={ORANGE}
        delay={PAD_AT}
        spring={PAD}
        rise={-70}
      />
      {BANNER.toes.map((part, index) => (
        <Part
          key={index}
          still={still}
          part={part}
          k={k}
          color={ORANGE}
          delay={PAD_AT + 140 + index * 60}
          spring={TOE}
          origin="50% 50%"
        />
      ))}
      <Animated.View
        style={[{ position: 'absolute', left: left * k, top: top * k, overflow: 'hidden' }, wipeStyle]}>
        <Svg width={width * k} height={height * k} viewBox={BANNER.tagline.box.join(' ')}>
          <Path d={BANNER.tagline.d} fill={ink} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * The banner putting itself together over the whole screen when the app opens. It leaves once it
 * has played and `ready` is true. With `toLogo` the banner first moves onto the welcome screen's
 * logo and only the background fades; without it, the whole splash fades.
 */
export function AnimatedSplash({
  ready,
  toLogo,
  onDone,
}: {
  ready: boolean;
  toLogo: boolean;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [played, setPlayed] = useState(false);
  const [target, setTarget] = useState<Frame | null>(null);
  const banner = useRef<View>(null);
  const leaving = useRef(false);
  const fade = useSharedValue(1);
  const veil = useSharedValue(1);
  const move = useSharedValue({ x: 0, y: 0 });

  useEffect(() => watchSplashTarget(setTarget), []);

  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), END);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!played || !ready || leaving.current) return;
    if (!toLogo) {
      leaving.current = true;
      fade.value = withTiming(0, { duration: FADE });
      setTimeout(onDone, FADE);
      return;
    }
    // The welcome screen has not measured its logo yet. This runs again when it has.
    if (!target) return;
    // Once only: measuring the banner again while it moves would give the wrong place.
    leaving.current = true;
    banner.current?.measureInWindow((x, y) => {
      move.value = withTiming(
        { x: target.left - x, y: target.top - y },
        { duration: MOVE, easing: EASE }
      );
    });
    // The banner now covers the logo exactly, so the background can go and nothing seems to change.
    veil.value = withDelay(MOVE, withTiming(0, { duration: FADE }));
    setTimeout(onDone, MOVE + FADE);
  }, [played, ready, toLogo, target, fade, veil, move, onDone]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const moveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: move.value.x }, { translateY: move.value.y }],
  }));

  return (
    <Animated.View
      // The phone's own splash goes away only once this one is drawn, so nothing flashes between.
      onLayout={() => SplashScreen.hide()}
      accessibilityLabel="PawPin"
      style={[StyleSheet.absoluteFill, styles.screen, fadeStyle]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }, veilStyle]}
      />
      <Animated.View ref={banner} style={moveStyle}>
        <Banner />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: 'center', justifyContent: 'center' },
});
