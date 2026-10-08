import { Button, Dialog } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandIcon, GOOGLE_LOGO } from '@/components/brand-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { linkGoogle, signInWithGoogle, type AuthFlowError } from '@/lib/auth';

type GoogleSignInDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Shown when a guest tries something only a Google user may do. Says why, and offers the sign-in.
 * The guest keeps their account and their reports; only the way they sign in changes.
 */
export function GoogleSignInDialog({ isOpen, onClose }: GoogleSignInDialogProps) {
  const [status, setStatus] = useState<'idle' | 'working' | 'failed' | 'conflict'>('idle');

  function close() {
    setStatus('idle');
    onClose();
  }

  async function run(action: () => Promise<boolean>) {
    setStatus('working');
    try {
      // False when the browser was closed without signing in: stay here, nothing went wrong.
      if (await action()) close();
      else setStatus('idle');
    } catch (error) {
      // The chosen Google account already has its own PawPin account, so it cannot be joined to this guest.
      const isConflict = (error as AuthFlowError).code === 'identity_already_exists';
      if (!isConflict) console.warn('Google sign-in failed:', error);
      setStatus(isConflict ? 'conflict' : 'failed');
    }
  }

  const isConflict = status === 'conflict';

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>
            {isConflict ? 'This Google account is already on PawPin' : 'Sign in to respond'}
          </Dialog.Title>
          <Dialog.Description>
            {isConflict
              ? 'It has its own account, so it cannot be joined to this guest. If you switch, reports you made as a guest stay behind and you cannot get back to them.'
              : 'Rescuers need an account others can trust. Sign in with Google and your reports stay yours.'}
          </Dialog.Description>
          {status === 'failed' && (
            <ThemedText type="small" role="alert" style={styles.failed}>
              Could not sign you in. Check your connection and try again.
            </ThemedText>
          )}
          <View style={styles.choices}>
            <Button variant="secondary" onPress={close}>
              {isConflict ? 'Stay as guest' : 'Not now'}
            </Button>
            <Button
              isDisabled={status === 'working'}
              onPress={() => run(isConflict ? signInWithGoogle : linkGoogle)}>
              <BrandIcon xml={GOOGLE_LOGO} size={22} />
              <Button.Label>
                {status === 'working'
                  ? 'Signing in…'
                  : isConflict
                    ? 'Switch'
                    : 'Sign in with Google'}
              </Button.Label>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  failed: {
    marginTop: Spacing.two,
  },
  // Same place and order as the choices on the Profile tab's guest card.
  choices: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
