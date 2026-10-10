import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { Card, useThemeColor } from 'heroui-native';
import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tally } from '@/lib/admin';

// The charts on the admin's Dashboard. Drawn with plain views and one SVG ring, no chart library.
// Marks carry the color; every word and number stays in the text colors, and every colored part
// is named beside its color, so nothing is told by color alone.

/** How tall the tallest bar of a chart is. */
const PLOT_HEIGHT = 96;
/** A bar is never wider than this, however few there are. */
const BAR_MAX_WIDTH = 24;
/** The rounded end of a bar. The end on the baseline stays square. */
const BAR_END = 4;
/** The gap, in the surface's own color, that keeps touching marks apart. */
const MARK_GAP = 2;

// Each set of colors below was checked as a set for people who see color differently, on the
// light and the dark surface, with the dataviz palette validator.

/** How finished reports ended. */
export const OUTCOME_COLORS = {
  rescued: '#3A9A5B',
  not_found: '#9A6BD0',
  closed: '#B5822A',
} as const;

/**
 * How urgent, for a chart. The map's own red and orange (`URGENCY_COLORS`) are too close to be
 * told apart as two parts of one ring, so the middle one is an amber here.
 */
export const URGENCY_CHART_COLORS = {
  critical: '#C62828',
  needs_help_soon: '#C28100',
  just_sighted: '#1565C0',
} as const;

/** For parts with no meaning of their own, in this order. Each theme has its own steps. */
const SERIES_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
} as const;

/** The colors for up to five parts that have none of their own, for the theme in use. */
export function useSeriesColors() {
  return SERIES_COLORS[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

type ChartCardProps = PropsWithChildren<{
  title: string;
  /** The one line under the title: what the chart adds up to. */
  summary?: string;
  /** Makes the whole card a button. */
  onPress?: () => void;
  /** What the button does, read out after the title and summary. */
  hint?: string;
}>;

/** A titled surface for one chart or one number. Same surface as the cards on the Profile tab. */
export function ChartCard({ title, summary, onPress, hint, children }: ChartCardProps) {
  const card = (
    <Card variant="default" style={styles.card}>
      <View style={styles.cardHeading}>
        <ThemedText type="small" role="heading" themeColor="textSecondary">
          {title}
        </ThemedText>
        {summary && <ThemedText style={styles.summary}>{summary}</ThemedText>}
      </View>
      {children}
    </Card>
  );
  if (!onPress) return card;
  return (
    <Pressable
      role="button"
      aria-label={[title, summary, hint].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {card}
    </Pressable>
  );
}

type StatCardProps = {
  icon: IconSvgElement;
  label: string;
  value: string;
  /** Red when the number is something to act on. The label still says what it is. */
  isAlert?: boolean;
  onPress?: () => void;
  /** What the button does, read out after the number. */
  hint?: string;
};

/**
 * One number worth knowing at a glance, and where it leads: its icon and the number on one line,
 * and a word or two under them for what it counts. Sits two to a row.
 */
export function StatCard({ icon, label, value, isAlert = false, onPress, hint }: StatCardProps) {
  const [accent, danger] = useThemeColor(['accent', 'danger']);
  const tone = isAlert ? danger : accent;
  return (
    <Pressable
      role={onPress ? 'button' : undefined}
      accessible
      aria-label={[`${label}: ${value}`, onPress && hint].filter(Boolean).join('. ')}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>
      <Card variant="default" style={styles.statCard}>
        <View style={styles.statTop}>
          <View style={styles.statIcon}>
            {/* Theme colors come in more than one notation, so the tint is a see-through layer. */}
            <View style={[StyleSheet.absoluteFill, styles.statTint, { backgroundColor: tone }]} />
            <HugeiconsIcon icon={icon} size={20} color={tone} strokeWidth={1.8} />
          </View>
          <ThemedText style={styles.statValue}>{value}</ThemedText>
        </View>
        {/* One short line. The icon says the rest. */}
        <ThemedText numberOfLines={1} style={styles.statLabel}>
          {label}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

/** "2026-10-10" as that day on this phone, not as midnight UTC. */
function dateOf(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function percent(count: number, total: number) {
  return total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`;
}

/**
 * One bar per day, oldest first, today last. One bar is picked out and read in words under the
 * chart: today at first, then whichever is tapped. That line stands in for an axis and for a
 * number over every bar.
 */
export function DayBars({ days }: { days: { day: string; count: number }[] }) {
  const accent = useThemeColor('accent');
  const theme = useTheme();
  const [picked, setPicked] = useState(days.length - 1);
  const shown = days[Math.min(picked, days.length - 1)];
  const most = Math.max(1, ...days.map((day) => day.count));
  const long = (day: string) =>
    dateOf(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const short = (day: string) =>
    dateOf(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <View style={styles.chart}>
      <View style={styles.plot}>
        {days.map((day, index) => (
          // The whole column is the touch area, not only the bar: a short bar is still easy to hit.
          <Pressable
            key={day.day}
            role="button"
            aria-label={`${long(day.day)}: ${plural(day.count, 'report', 'reports')}`}
            aria-selected={index === picked}
            onPress={() => setPicked(index)}
            style={styles.column}>
            <View
              style={[
                styles.bar,
                day.count === 0
                  ? // A day with none still marks its place on the baseline.
                    { height: 2, backgroundColor: theme.backgroundSelected }
                  : {
                      height: Math.max(BAR_END * 2, (day.count / most) * PLOT_HEIGHT),
                      backgroundColor: accent,
                      // The picked bar at full strength, the rest stepped back.
                      opacity: index === picked ? 1 : 0.45,
                    },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <View style={[styles.baseline, { backgroundColor: theme.backgroundSelected }]} />
      <View style={styles.ends}>
        <ThemedText themeColor="textSecondary" style={styles.tick}>
          {short(days[0].day)}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.tick}>
          Today
        </ThemedText>
      </View>
      <ThemedText type="small" aria-live="polite" style={styles.readout}>
        {long(shown.day)} · {plural(shown.count, 'report', 'reports')}
      </ThemedText>
    </View>
  );
}

/** One part of a whole: its name, how many, and the color of its piece of the chart. */
export type Share = Tally & { color: string };

/**
 * Every part named: its color, its name, how many, and its share. The names carry the meaning;
 * the colors only tie a name to its piece of the chart beside it.
 */
function Legend({ shares }: { shares: Share[] }) {
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  return (
    <View style={styles.legend}>
      {shares.map((share) => (
        <View
          key={share.label}
          accessible
          aria-label={`${share.label}: ${share.count}, ${percent(share.count, total)}`}
          style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: share.color }]} />
          <ThemedText type="small" numberOfLines={2} style={styles.legendLabel}>
            {share.label}
          </ThemedText>
          <ThemedText type="small" style={styles.number}>
            {share.count}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.percent}>
            {percent(share.count, total)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Parts of one whole as one bar, with every part named under it. */
export function ShareBar({ shares }: { shares: Share[] }) {
  return (
    <View style={styles.chart}>
      {/* The gap between parts is the card showing through, not a line drawn around them. */}
      <View aria-hidden style={styles.shareBar}>
        {shares
          .filter((share) => share.count > 0)
          .map((share) => (
            <View
              key={share.label}
              style={[styles.sharePart, { flex: share.count, backgroundColor: share.color }]}
            />
          ))}
      </View>
      <Legend shares={shares} />
    </View>
  );
}

const RING_SIZE = 132;
const RING_WIDTH = 18;

type RingProps = {
  shares: Share[];
  /** The word under the total in the middle of the ring: what is being counted. */
  unit: string;
};

/**
 * Parts of one whole as a ring, the total in its middle, every part named under it. For a few
 * parts in a set order, where how they split matters more than their exact sizes.
 */
export function Ring({ shares, unit }: RingProps) {
  const theme = useTheme();
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  const radius = (RING_SIZE - RING_WIDTH) / 2;
  const around = 2 * Math.PI * radius;
  const parts = shares.filter((share) => share.count > 0);
  // A lone part is a whole ring, with no gap to break it.
  const gap = parts.length > 1 ? MARK_GAP : 0;
  // Where each part starts, as a length along the ring.
  const starts = parts.map((_, index) =>
    parts.slice(0, index).reduce((sum, share) => sum + (share.count / total) * around, 0),
  );

  return (
    <View style={styles.chart}>
      <View aria-hidden style={styles.ring}>
        {/* Turned so the first part starts at the top and they run clockwise. */}
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringTurn}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke={theme.backgroundSelected}
            strokeWidth={RING_WIDTH}
            fill="none"
          />
          {parts.map((share, index) => (
            <Circle
              key={share.label}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radius}
              stroke={share.color}
              strokeWidth={RING_WIDTH}
              strokeDasharray={[Math.max(0, (share.count / total) * around - gap), around]}
              strokeDashoffset={-starts[index]}
              fill="none"
            />
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringMiddle]}>
          <ThemedText style={styles.ringTotal}>{total}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tick}>
            {unit}
          </ThemedText>
        </View>
      </View>
      <Legend shares={shares} />
    </View>
  );
}

const TILE_COLUMNS = 10;
const TILE_ROWS = 4;

/**
 * Parts of one whole as a field of forty tiles, each part filling its share of them from the top
 * left, with every part named under it. Shares read as areas, and a small one still gets a tile.
 */
export function Tiles({ shares }: { shares: Share[] }) {
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  const cells = TILE_COLUMNS * TILE_ROWS;
  // Whole tiles first; the tiles left over go to the largest remainders, so they add up to forty.
  const exact = shares.map((share) => (share.count / total) * cells);
  const filled = exact.map(Math.floor);
  const spare = cells - filled.reduce((sum, count) => sum + count, 0);
  exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest)
    .slice(0, spare)
    .forEach(({ index }) => {
      filled[index] += 1;
    });
  const colors = shares.flatMap((share, index) =>
    Array.from({ length: filled[index] }, () => share.color),
  );

  return (
    <View style={styles.chart}>
      <View aria-hidden style={styles.tiles}>
        {Array.from({ length: TILE_ROWS }, (_, row) => (
          <View key={row} style={styles.tileRow}>
            {colors.slice(row * TILE_COLUMNS, (row + 1) * TILE_COLUMNS).map((color, column) => (
              <View key={column} style={[styles.tile, { backgroundColor: color }]} />
            ))}
          </View>
        ))}
      </View>
      <Legend shares={shares} />
    </View>
  );
}

/**
 * A few things compared by how many, as standing bars: the number on each bar's top, its name
 * under it. All one color, because they measure the same thing. Most first.
 */
export function Columns({ rows }: { rows: Tally[] }) {
  const accent = useThemeColor('accent');
  const theme = useTheme();
  const most = Math.max(1, ...rows.map((row) => row.count));

  return (
    <View style={styles.columns}>
      {rows.map((row) => (
        <View
          key={row.label}
          accessible
          aria-label={`${row.label}: ${row.count}`}
          style={styles.columnsItem}>
          <View style={styles.columnsPlot}>
            <ThemedText type="small" style={styles.number}>
              {row.count}
            </ThemedText>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(BAR_END * 2, (row.count / most) * PLOT_HEIGHT),
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
          <View style={[styles.columnsBase, { backgroundColor: theme.backgroundSelected }]} />
          <ThemedText themeColor="textSecondary" numberOfLines={2} style={styles.columnsLabel}>
            {row.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Surface and corner come from HeroUI Card, as on the Profile tab.
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  cardHeading: {
    gap: Spacing.half,
  },
  summary: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.7,
  },
  // Half of a row of two.
  stat: {
    flex: 1,
  },
  // As tall as its neighbor, whichever has more words.
  statCard: {
    flex: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  // The icon at one end, the number at the other.
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  statTint: {
    opacity: 0.12,
  },
  statLabel: {
    fontWeight: 600,
  },
  // The one large thing on the card. Digits of equal width, so the numbers of the cards line up
  // down each column's right edge.
  statValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  chart: {
    gap: Spacing.three,
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: PLOT_HEIGHT,
    gap: MARK_GAP,
  },
  // As tall as the plot whatever the bar's height, so every day is as easy to tap.
  column: {
    flex: 1,
    height: PLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    maxWidth: BAR_MAX_WIDTH,
    borderTopLeftRadius: BAR_END,
    borderTopRightRadius: BAR_END,
  },
  // Straight under the plot: the chart's own gap is taken back.
  baseline: {
    height: StyleSheet.hairlineWidth,
    marginTop: -Spacing.three,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -Spacing.two,
  },
  tick: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 400,
  },
  readout: {
    fontVariant: ['tabular-nums'],
  },
  shareBar: {
    flexDirection: 'row',
    height: 12,
    gap: MARK_GAP,
    borderRadius: BAR_END,
    overflow: 'hidden',
  },
  sharePart: {
    height: '100%',
  },
  legend: {
    gap: Spacing.two,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontWeight: 400,
  },
  number: {
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  // Wide enough for "100%", so the numbers before it line up down the card.
  percent: {
    width: 40,
    textAlign: 'right',
    fontWeight: 400,
    fontVariant: ['tabular-nums'],
  },
  // In the middle of the card, over its names.
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignSelf: 'center',
  },
  ringTurn: {
    transform: [{ rotate: '-90deg' }],
  },
  ringMiddle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTotal: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  tiles: {
    gap: MARK_GAP,
  },
  tileRow: {
    flexDirection: 'row',
    gap: MARK_GAP,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 3,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  columnsItem: {
    flex: 1,
    gap: Spacing.one,
  },
  // Room for the number over the tallest bar.
  columnsPlot: {
    height: PLOT_HEIGHT + 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.half,
  },
  columnsBase: {
    height: StyleSheet.hairlineWidth,
    marginTop: -Spacing.one,
  },
  columnsLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 400,
    textAlign: 'center',
  },
});
