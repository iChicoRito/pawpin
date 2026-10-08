import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import HeartCheckIcon from '@hugeicons/core-free-icons/HeartCheckIcon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon';
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import UserSwitchIcon from '@hugeicons/core-free-icons/UserSwitchIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Button,
  FieldError,
  Input,
  Label,
  ListGroup,
  Separator,
  TextField,
  useThemeColor,
} from 'heroui-native';
import { Fragment, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandIcon, GOOGLE_LOGO } from '@/components/brand-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { APPEARANCES, useAppearance } from '@/lib/appearance';
import { linkGoogle, signInWithGoogle, type AuthFlowError } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const NAME_MAX_LENGTH = 40;

export default function ProfileScreen() {
  const { session, isGuest, name, avatarUrl } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [foreground, accent] = useThemeColor(['foreground', 'accent']);
  const [isEditingName, setIsEditingName] = useState(false);
  const appearance = useAppearance();

  const displayName = name ?? (isGuest ? 'Guest' : 'Google account');
  const joined =
    session &&
    new Date(session.user.created_at).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });

  // The rows of the menu, top to bottom. Some are only for guests, some only for Google users.
  const options = [
    // Google users take their name from Google, so only guests can set one here.
    isGuest &&
      !isEditingName && {
        icon: PencilEdit01Icon,
        title: name ? 'Edit name' : 'Add your name',
        description: 'Shown to others on your reports.',
        onPress: () => setIsEditingName(true),
      },
    {
      icon: Megaphone01Icon,
      title: 'Your reports',
      description: 'Strays you reported, and what became of them.',
      onPress: () => router.push({ pathname: '/history', params: { kind: 'reports' } }),
    },
    // Only Google users can go to an animal, so only they have rescues.
    !isGuest && {
      icon: HeartCheckIcon,
      title: 'Your rescues',
      description: 'Animals you marked as rescued.',
      onPress: () => router.push({ pathname: '/history', params: { kind: 'rescues' } }),
    },
    {
      icon: Moon02Icon,
      title: 'Appearance',
      // Says what is chosen now.
      description: APPEARANCES.find((option) => option.value === appearance)?.label ?? '',
      onPress: () => router.push('/appearance'),
    },
    {
      icon: Settings01Icon,
      title: 'Settings',
      description: 'Account, privacy, and signing out.',
      onPress: () => router.push('/settings'),
    },
  ].filter((option) => !!option);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <ThemedText type="subtitle" role="heading">
          Profile
        </ThemedText>

        <View style={styles.identity}>
          <Avatar alt={displayName} size="lg" color="accent" variant="soft">
            {avatarUrl && <Avatar.Image source={{ uri: avatarUrl }} />}
            <Avatar.Fallback>
              {!name ? (
                <HugeiconsIcon icon={UserIcon} size={28} color={accent} />
              ) : (
                initialsOf(name)
              )}
            </Avatar.Fallback>
          </Avatar>
          <View style={styles.identityText}>
            <ThemedText style={styles.name} numberOfLines={2}>
              {displayName}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isGuest ? 'Guest account on this phone' : 'Signed in with Google'}
            </ThemedText>
            {joined && (
              <ThemedText type="small" themeColor="textSecondary">
                Joined {joined}
              </ThemedText>
            )}
          </View>
        </View>

        {isGuest && isEditingName && (
          <NameEditor currentName={name ?? ''} onDone={() => setIsEditingName(false)} />
        )}

        {isGuest && <GuestCard />}

        {/* One HeroUI ListGroup, the same grouped list as the List tab: an icon, a name, one line
            on what the row is for, and the arrow that says it opens something. */}
        <ListGroup>
          {options.map((option, index) => (
            <Fragment key={option.title}>
              {index > 0 && <Separator className="mx-4" />}
              <ListGroup.Item role="button" onPress={option.onPress}>
                <ListGroup.ItemPrefix>
                  <HugeiconsIcon icon={option.icon} size={20} color={foreground} />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{option.title}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>{option.description}</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      </ScrollView>
    </ThemedView>
  );
}

function NameEditor({ currentName, onDone }: { currentName: string; onDone: () => void }) {
  const [value, setValue] = useState(currentName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');

  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;

  async function save() {
    setStatus('saving');
    // The name lives on the account; a database trigger copies it into the profiles table.
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    if (error) {
      console.warn('Saving name failed:', error);
      setStatus('failed');
      return;
    }
    onDone();
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <TextField isInvalid={status === 'failed'}>
        <Label>Your name</Label>
        <Input
          value={value}
          onChangeText={setValue}
          maxLength={NAME_MAX_LENGTH}
          placeholder="Enter your name"
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => !isEmpty && save()}
        />
        {status === 'failed' && (
          <FieldError>Could not save your name. Check your connection and try again.</FieldError>
        )}
      </TextField>
      <View style={styles.choices}>
        <Button variant="secondary" onPress={onDone}>
          Cancel
        </Button>
        <Button isDisabled={isEmpty || status === 'saving'} onPress={save}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </Button>
      </View>
    </ThemedView>
  );
}

type Status = 'idle' | 'working' | 'failed' | 'conflict';

function GuestCard() {
  const [status, setStatus] = useState<Status>('idle');

  async function run(action: () => Promise<boolean>) {
    setStatus('working');
    try {
      await action();
      setStatus('idle');
    } catch (error) {
      // The chosen Google account already has its own PawPin account, so it cannot be joined to this guest.
      const isConflict = (error as AuthFlowError).code === 'identity_already_exists';
      if (!isConflict) console.warn('Google sign-in failed:', error);
      setStatus(isConflict ? 'conflict' : 'failed');
    }
  }

  if (status === 'conflict') return <AccountConflict onStay={() => setStatus('idle')} />;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Keep your reports</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Guest reports can be lost if you uninstall the app or change phones. Sign in with Google to
        keep them.
      </ThemedText>
      {status === 'failed' && (
        <ThemedText type="small" role="alert">
          Could not sign you in. Check your connection and try again.
        </ThemedText>
      )}
      <Button
        style={styles.cardAction}
        isDisabled={status === 'working'}
        onPress={() => run(linkGoogle)}>
        <BrandIcon xml={GOOGLE_LOGO} size={22} />
        <Button.Label>{status === 'working' ? 'Signing in…' : 'Sign in with Google'}</Button.Label>
      </Button>
    </ThemedView>
  );
}

/**
 * Shown when the Google account a guest picked already has its own PawPin account, so the two
 * cannot be joined. Says what each choice does before it is made: switching leaves the guest's
 * reports behind for good.
 */
function AccountConflict({ onStay }: { onStay: () => void }) {
  const [foreground, muted] = useThemeColor(['foreground', 'muted']);
  // The card stays up while the switch runs, and says so here if it fails.
  const [switching, setSwitching] = useState<'idle' | 'working' | 'failed'>('idle');

  async function switchAccount() {
    setSwitching('working');
    try {
      // On success the session changes and this guest's card is gone with it. False means the
      // browser was closed without signing in: nothing went wrong.
      if (!(await signInWithGoogle())) setSwitching('idle');
    } catch (error) {
      console.warn('Switching account failed:', error);
      setSwitching('failed');
    }
  }

  return (
    <ThemedView type="backgroundElement" role="alert" style={styles.conflict}>
      <View style={styles.conflictHeading}>
        <ThemedView type="backgroundSelected" style={styles.conflictIcon}>
          <HugeiconsIcon icon={UserSwitchIcon} size={20} color={foreground} />
        </ThemedView>
        <View style={styles.conflictTitle}>
          <ThemedText style={styles.conflictName}>
            This Google account is already on PawPin
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            It has its own account, so it cannot be joined to this guest.
          </ThemedText>
        </View>
      </View>

      {/* What is lost by switching, set apart so it is read before the buttons. */}
      <View style={styles.conflictNote}>
        <HugeiconsIcon icon={Alert02Icon} size={18} color={muted} />
        <ThemedText type="small" style={styles.conflictNoteText}>
          Reports you made as a guest stay with the guest account. After you switch, you cannot get
          back to them.
        </ThemedText>
      </View>

      {switching === 'failed' && (
        <ThemedText type="small" role="alert">
          Could not switch. Check your connection and try again.
        </ThemedText>
      )}

      {/* Equal halves: neither choice is the "wrong" one. Staying keeps the reports. */}
      <View style={styles.conflictChoices}>
        <Button
          variant="secondary"
          style={styles.conflictChoice}
          isDisabled={switching === 'working'}
          onPress={onStay}>
          Stay as guest
        </Button>
        <Button
          style={styles.conflictChoice}
          isDisabled={switching === 'working'}
          onPress={switchAccount}>
          <BrandIcon xml={GOOGLE_LOGO} size={22} />
          <Button.Label>{switching === 'working' ? 'Switching…' : 'Switch'}</Button.Label>
        </Button>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // One column: every block below shares this left and right edge.
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  identityText: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  cardAction: {
    marginTop: Spacing.two,
  },
  // Same surface as the card it replaces, with more room between its three parts.
  conflict: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  conflictHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  conflictIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conflictTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  conflictName: {
    fontWeight: 600,
  },
  conflictNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  conflictNoteText: {
    flex: 1,
  },
  conflictChoices: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  conflictChoice: {
    flex: 1,
  },
  choices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
