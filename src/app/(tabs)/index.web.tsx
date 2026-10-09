import { Typography } from 'heroui-native';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Browser version of the Map tab. The map library has no browser version, so the browser says so
// plainly.
export default function MapScreen() {
  return (
    <ThemedView style={styles.container}>
      <Typography type="h3" role="heading">
        Map
      </Typography>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        The map works in the phone app.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  text: {
    textAlign: 'center',
  },
});
