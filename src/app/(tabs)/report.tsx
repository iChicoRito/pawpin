import { StyleSheet } from 'react-native';

import { ReportPermissions } from '@/components/report-permissions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ReportScreen() {
  return (
    <ReportPermissions>
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary">Camera comes next.</ThemedText>
      </ThemedView>
    </ReportPermissions>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
