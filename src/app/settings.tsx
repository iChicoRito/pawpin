import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { Avatar, Button, Dialog, ListGroup, Separator, useThemeColor } from 'heroui-native';
import { Fragment, useState, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { AppDialogOverlay } from '@/components/drawer-backdrop';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { initialsOf } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'confirming' | 'working' | 'failed';

type Fact = { icon: IconSvgElement; title: string; description: string };

/**
 * The account, what PawPin keeps about it, and the way out. Every group is a HeroUI ListGroup,
 * the same grouped list as the Profile tab's menu, and is there to read. The one thing to do is
 * the red button at the foot: sign out.
 */
export default function SettingsScreen() {
  const { isGuest, name, avatarUrl } = useSession();
  const insets = useSafeAreaInsets();
  const [foreground, accent] = useThemeColor(['foreground', 'accent']);
  const [status, setStatus] = useState<Status>('idle');

  async function signOut() {
    setStatus('working');
    const { error } = await supabase.auth.signOut();
    // On success the route guard in the root layout swaps this screen for the welcome screen.
    if (error) {
      console.warn('Sign-out failed:', error);
      setStatus('failed');
    }
  }

  const displayName = name ?? (isGuest ? 'Guest' : 'Google account');

  // What is kept, one plain fact per row. Guests and Google users are kept differently.
  const kept: Fact[] = isGuest
    ? [
        {
          icon: UserIcon,
          title: 'Your guest name',
          description: 'Made up by PawPin. Nothing else about you; guests are not asked for an email.',
        },
        {
          icon: Megaphone01Icon,
          title: 'Your reports',
          description: 'The photos, place, and details of each stray you report.',
        },
      ]
    : [
        {
          icon: UserIcon,
          title: 'Your Google name and photo',
          description: 'Copied from your Google account when you sign in.',
        },
        {
          icon: Mail01Icon,
          title: 'Your email',
          description: 'Used to sign you in. Not shown to anyone.',
        },
        {
          icon: Megaphone01Icon,
          title: 'Your reports and rescues',
          description: 'The photos, place, and details of each stray, and what became of it.',
        },
      ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <Section title="Account">
          <ListGroup>
            {/* A row to read, not to press. */}
            <ListGroup.Item pointerEvents="none">
              <ListGroup.ItemPrefix>
                <Avatar alt={displayName} size="md" color="accent" variant="soft">
                  {avatarUrl && <Avatar.Image source={{ uri: avatarUrl }} />}
                  <Avatar.Fallback>
                    {name && !isGuest ? (
                      initialsOf(name)
                    ) : (
                      <HugeiconsIcon icon={UserIcon} size={20} color={accent} />
                    )}
                  </Avatar.Fallback>
                </Avatar>
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{displayName}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription>
                  {isGuest ? 'Guest account. It lives on this phone only.' : 'Signed in with Google'}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </ListGroup>
        </Section>

        <Section title="What PawPin keeps">
          <ListGroup>
            {kept.map((fact, index) => (
              <Fragment key={fact.title}>
                {index > 0 && <Separator className="mx-4" />}
                <FactRow fact={fact} color={foreground} />
              </Fragment>
            ))}
          </ListGroup>
        </Section>

        <Section title="Who can see it">
          <ListGroup>
            <FactRow
              color={foreground}
              fact={{
                icon: ViewIcon,
                title: 'People signed in to PawPin',
                description: isGuest
                  ? 'On each report you send, they see your guest name, the month you joined, and how many reports you have sent.'
                  : 'On each report you send, they see your name, your photo, the month you joined, and how many reports you have sent.',
              }}
            />
          </ListGroup>
        </Section>

        <View style={styles.section}>
          {/* A guest account cannot be signed back into, so a guest is asked first. */}
          <Button
            variant="danger"
            isDisabled={status === 'working'}
            onPress={isGuest ? () => setStatus('confirming') : signOut}>
            {status === 'working' ? 'Signing out…' : 'Sign out'}
          </Button>
          {status === 'failed' && (
            <ThemedText type="small" role="alert">
              Could not sign you out. Check your connection and try again.
            </ThemedText>
          )}
        </View>

      </ScrollView>

      {/* Signing out as a guest loses the account for good, so it is asked in a dialog. */}
      <Dialog
        isOpen={status === 'confirming'}
        onOpenChange={(open) => !open && status === 'confirming' && setStatus('idle')}>
        <Dialog.Portal>
          <AppDialogOverlay />
          <Dialog.Content>
            <Dialog.Title>Sign out as a guest?</Dialog.Title>
            <Dialog.Description>
              Your guest account and its reports cannot be recovered. To keep them, sign in with
              Google from the Profile tab first.
            </Dialog.Description>
            <View style={styles.choices}>
              <Button variant="tertiary" onPress={() => setStatus('idle')}>
                Stay signed in
              </Button>
              <Button variant="danger" onPress={signOut}>
                Sign out
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </ThemedView>
  );
}

/** One fact to read: an icon, what it is, and one line about it. */
function FactRow({ fact, color }: { fact: Fact; color: string }) {
  return (
    <ListGroup.Item pointerEvents="none">
      <ListGroup.ItemPrefix>
        <HugeiconsIcon icon={fact.icon} size={20} color={color} />
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{fact.title}</ListGroup.ItemTitle>
        <ListGroup.ItemDescription>{fact.description}</ListGroup.ItemDescription>
      </ListGroup.ItemContent>
    </ListGroup.Item>
  );
}

/** A group with its name over it, as the months are named on "Your reports". */
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" role="heading" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Groups sit further apart than a group's name and its list.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  // Same place and order as the choices in the other dialogs. They wrap on a narrow phone.
  choices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
