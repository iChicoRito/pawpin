import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import HeartCheckIcon from '@hugeicons/core-free-icons/HeartCheckIcon';
import Megaphone01Icon from '@hugeicons/core-free-icons/Megaphone01Icon';
import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon';
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Button,
  FieldError,
  Input,
  Label,
  Select,
  TextField,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { APPEARANCES, setAppearance, useAppearance } from '@/lib/appearance';
import { linkGoogle, signInWithGoogle, type AuthFlowError } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const NAME_MAX_LENGTH = 40;

export default function ProfileScreen() {
  const { session, isGuest, name, avatarUrl } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [foreground, accent, muted, border] = useThemeColor([
    'foreground',
    'accent',
    'muted',
    'border',
  ]);
  const [isEditingName, setIsEditingName] = useState(false);
  const appearance = useAppearance();

  const displayName = name ?? (isGuest ? 'Guest' : 'Google account');
  const joined =
    session &&
    new Date(session.user.created_at).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });

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

        {/* Same surface and padding as the card above, so the icon lines up with the card's text. */}
        <ThemedView type="backgroundElement" style={styles.menu}>
          {/* Google users take their name from Google, so only guests can set one here. */}
          {isGuest && !isEditingName && (
            <Pressable
              role="button"
              onPress={() => setIsEditingName(true)}
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowDivided,
                { borderBottomColor: border },
                pressed && styles.pressed,
              ]}>
              <HugeiconsIcon icon={PencilEdit01Icon} size={18} color={foreground} />
              <ThemedText style={styles.menuLabel}>{name ? 'Edit name' : 'Add your name'}</ThemedText>
            </Pressable>
          )}
          {/* The viewer's own history, each on its own screen. */}
          <Pressable
            role="button"
            onPress={() => router.push({ pathname: '/history', params: { kind: 'reports' } })}
            style={({ pressed }) => [
              styles.menuRow,
              styles.menuRowDivided,
              { borderBottomColor: border },
              pressed && styles.pressed,
            ]}>
            <HugeiconsIcon icon={Megaphone01Icon} size={18} color={foreground} />
            <ThemedText style={styles.menuLabel}>Your reports</ThemedText>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} color={muted} />
          </Pressable>
          {/* Only Google users can go to an animal, so only they have rescues. */}
          {!isGuest && (
            <Pressable
              role="button"
              onPress={() => router.push({ pathname: '/history', params: { kind: 'rescues' } })}
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowDivided,
                { borderBottomColor: border },
                pressed && styles.pressed,
              ]}>
              <HugeiconsIcon icon={HeartCheckIcon} size={18} color={foreground} />
              <ThemedText style={styles.menuLabel}>Your rescues</ThemedText>
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} color={muted} />
            </Pressable>
          )}
          {/* A row like the others. Tapping it opens the three choices in a sheet from the bottom. */}
          <Select
            // Must be the same word as on Select.Content below, or HeroUI throws.
            presentation="bottom-sheet"
            value={APPEARANCES.find((option) => option.value === appearance)}
            onValueChange={(option) => option && setAppearance(option.value as typeof appearance)}>
            <Select.Trigger
              variant="unstyled"
              aria-label={`Appearance, ${appearance}`}
              style={[styles.menuRow, styles.menuRowDivided, { borderBottomColor: border }]}>
              <HugeiconsIcon icon={Moon02Icon} size={18} color={foreground} />
              <ThemedText style={styles.menuLabel}>Appearance</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {APPEARANCES.find((option) => option.value === appearance)?.label}
              </ThemedText>
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} color={muted} />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="bottom-sheet">
                {APPEARANCES.map((option) => (
                  <Select.Item key={option.value} value={option.value} label={option.label} />
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
          <Pressable
            role="button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
            <HugeiconsIcon icon={Settings01Icon} size={18} color={foreground} />
            <ThemedText style={styles.menuLabel}>Settings</ThemedText>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} color={muted} />
          </Pressable>
        </ThemedView>
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

  if (status === 'conflict') {
    return (
      <ThemedView type="backgroundElement" role="alert" style={styles.card}>
        <ThemedText type="smallBold">This Google account already has a PawPin account</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Switch to it? Reports made as a guest will stay with the guest account.
        </ThemedText>
        <View style={styles.choices}>
          <Button variant="secondary" onPress={() => setStatus('idle')}>
            Cancel
          </Button>
          <Button onPress={() => run(signInWithGoogle)}>Switch account</Button>
        </View>
      </ThemedView>
    );
  }

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
        {status === 'working' ? 'Signing in…' : 'Sign in with Google'}
      </Button>
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
  menu: {
    borderRadius: Spacing.three,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    // Keeps the keyboard focus ring on the card's rounded shape.
    borderRadius: Spacing.three,
  },
  menuRowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  menuLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  cardAction: {
    marginTop: Spacing.two,
  },
  choices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
