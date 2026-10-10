import HeartCheckIcon from '@hugeicons/core-free-icons/HeartCheckIcon';
import Location01Icon from '@hugeicons/core-free-icons/Location01Icon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Card } from 'heroui-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const FEATURES = [
  { icon: Megaphone01Icon, title: 'Report a stray', text: 'Share a photo, location, and the animal’s condition.' },
  { icon: Location01Icon, title: 'Find nearby reports', text: 'See strays around you on the map or in the list.' },
  { icon: HeartCheckIcon, title: 'Follow rescue progress', text: 'See when someone is on the way and how the report ends.' },
] as const;

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const version = Constants.expoConfig?.version;
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.brand}>
          <Image
            source={colorScheme === 'dark'
              ? require('../../assets/DarkMode.svg')
              : require('../../assets/LightMode.svg')}
            accessibilityLabel="PawPin"
            contentFit="contain"
            style={styles.logo}
          />
          {version && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
              Version {version}
            </ThemedText>
          )}
        </View>

        <Card variant="default" style={styles.section}>
          <ThemedText role="heading" style={styles.heading}>
            About PawPin
          </ThemedText>
          <ThemedText style={styles.body}>
            PawPin helps communities report stray animals, find nearby reports, and coordinate
            rescue efforts.
          </ThemedText>
          <View style={styles.features}>
            {FEATURES.map((feature) => (
              <View key={feature.title} style={styles.feature}>
                <ThemedView type="backgroundElement" aria-hidden style={styles.featureIcon}>
                  <HugeiconsIcon icon={feature.icon} size={22} color={theme.text} strokeWidth={1.8} />
                </ThemedView>
                <View style={styles.featureText}>
                  <ThemedText style={styles.featureTitle}>{feature.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                    {feature.text}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.credit}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.creditLabel}>
            Developed by
          </ThemedText>
          <ThemedText style={styles.developer}>Mark Adrianne Salunga</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.five,
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  logo: {
    width: '100%',
    maxWidth: 220,
    aspectRatio: 735 / 253,
  },
  version: {
    fontWeight: 400,
    textAlign: 'center',
  },
  section: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  heading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 600,
  },
  body: {
    fontWeight: 400,
  },
  features: {
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  featureTitle: {
    fontWeight: 600,
  },
  credit: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  creditLabel: {
    fontWeight: 400,
    textAlign: 'center',
  },
  developer: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: 600,
    textAlign: 'center',
  },
});
