import { Typography } from 'heroui-native';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Browser version of the List tab. The list is sorted by distance from the viewer, and the
// location library does not work in a browser, so the browser says so plainly.
export default function ListScreen() {
  return (
    <ThemedView style={styles.container}>
      <Typography type="h3" role="heading">
        Nearby strays
      </Typography>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        The list works in the phone app.
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
