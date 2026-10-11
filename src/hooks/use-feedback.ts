import { useToast } from 'heroui-native';
import { useEffect } from 'react';

import { playSound, type SoundKind } from '@/lib/sounds';

export function useSoundOnVisible(kind: SoundKind, trigger: boolean | string | null | undefined) {
  useEffect(() => {
    if (trigger) playSound(kind);
  }, [kind, trigger]);
}

/** Preserve HeroUI toast controls, adding one cue at the event rather than each toast render. */
export function useFeedbackToast() {
  const result = useToast();
  return {
    ...result,
    toast: {
      ...result.toast,
      show(options: string | (Exclude<Parameters<typeof result.toast.show>[0], string> & {
        sound?: SoundKind;
      })) {
        if (typeof options === 'string') return result.toast.show(options);
        const { sound, ...toastOptions } = options;
        const variant = 'variant' in options ? options.variant : undefined;
        const kind = sound ?? (variant === 'danger'
          ? 'error'
          : variant === 'success' ? 'success' : undefined);
        if (kind) playSound(kind);
        return result.toast.show(toastOptions);
      },
    },
  };
}
