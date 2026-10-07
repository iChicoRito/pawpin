import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';

export default function ProfileScreen() {
  const { isGuest } = useSession();

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Profile</ThemedText>
      {isGuest && (
        <ThemedView type="backgroundElement" style={styles.reminder}>
          <ThemedText type="smallBold">You are using PawPin as a guest</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your reports can be lost if you uninstall the app or change phones. Sign in with Google
            to keep them.
          </ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  reminder: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
