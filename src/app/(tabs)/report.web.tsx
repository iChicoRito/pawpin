import { Typography } from 'heroui-native';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Browser version of the Report tab. Reporting needs the phone's camera, its location, and a map
// library that has no browser version, so the browser says so plainly.
export default function ReportScreen() {
  return (
    <ThemedView style={styles.container}>
      <Typography type="h3" role="heading">
        Report a stray
      </Typography>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        Reporting works in the phone app.
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
