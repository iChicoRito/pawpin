import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/hooks/use-session';
import { connectSounds, setSoundsActive } from '@/lib/sounds';

/** soundcn's CC0 audio, played natively rather than through its browser-only AudioContext. */
export function SoundEffects() {
  const userId = useSession().session?.user.id;
  useEffect(() => {
    // Own disposal here: hook cleanup can release players before our queue is disconnected.
    const players = {
      success: createAudioPlayer(require('../../assets/sounds/success-chime.mp3')),
      error: createAudioPlayer(require('../../assets/sounds/error-003.mp3')),
      notification: createAudioPlayer(require('../../assets/sounds/notification-pop.mp3')),
      confirmation: createAudioPlayer(require('../../assets/sounds/question-001.mp3')),
    };
    let alive = true;
    let active = AppState.currentState === 'active';
    let finishCurrent: (() => void) | undefined;
    const ready = setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch((cause) => console.warn('Setting feedback audio mode failed:', cause));

    const stop = () => {
      for (const player of Object.values(players)) player.pause();
      finishCurrent?.();
    };
    const disconnect = connectSounds(async (kind) => {
      await ready;
      if (!alive || !active) return;
      const player = players[kind];
      await player.seekTo(0);
      if (!alive || !active) return;
      await new Promise<void>((resolve, reject) => {
        const finish = (cause?: unknown) => {
          clearTimeout(timeout);
          subscription.remove();
          finishCurrent = undefined;
          if (cause) reject(cause);
          else resolve();
        };
        const subscription = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) finish();
        });
        // Broken/blocked playback must not strand every later cue behind it.
        const timeout = setTimeout(() => {
          finish();
          player.pause();
        }, 3000);
        finishCurrent = finish;
        try {
          player.play();
        } catch (cause) {
          finish(cause);
        }
      });
    }, stop);
    setSoundsActive(active);
    const appState = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      setSoundsActive(active);
    });
    return () => {
      alive = false;
      appState.remove();
      disconnect();
      for (const player of Object.values(players)) player.release();
    };
  }, [userId]);

  return null;
}
