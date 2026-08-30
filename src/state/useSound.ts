import { useCallback, useEffect, useRef, useState } from 'react';
import {
  audioPrefs,
  onAudioPrefs,
  playSound,
  setMuted,
  setVolume,
  unlockAudio,
} from '@/lib/audio';
import type { SoundId } from '@/lib/audio';

/* =====================================================================
 * Sound, from React's side.
 *
 * Two jobs. `useSound` hands a component a play function that has
 * already dealt with the browser's autoplay rules — the first gesture
 * anywhere in the app brings the context up, and anything played before
 * that is a silent no-op rather than a thrown error.
 *
 * `useSoundPrefs` is the settings view of the same thing, kept in step
 * across every component that shows a volume control.
 * ===================================================================== */

/** Whether the one global unlock listener has been installed. */
let unlockArmed = false;

function armUnlock(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;

  /* Any of the three counts as the gesture browsers want. Once is
   * enough, so the listeners take themselves off again. */
  const wake = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
    window.removeEventListener('touchstart', wake);
  };

  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
  window.addEventListener('touchstart', wake, { once: true });
}

export function useSound(): (id: SoundId) => void {
  useEffect(armUnlock, []);
  return useCallback((id: SoundId) => playSound(id), []);
}

export interface SoundPrefs {
  muted: boolean;
  volume: number;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggle: () => void;
}

export function useSoundPrefs(): SoundPrefs {
  const [prefs, setPrefs] = useState(audioPrefs);

  useEffect(() => {
    armUnlock();
    return onAudioPrefs(setPrefs);
  }, []);

  return {
    muted: prefs.muted,
    volume: prefs.volume,
    setVolume: useCallback((volume: number) => {
      unlockAudio();
      setVolume(volume);
    }, []),
    setMuted: useCallback((muted: boolean) => {
      unlockAudio();
      setMuted(muted);
    }, []),
    toggle: useCallback(() => {
      unlockAudio();
      setMuted(!audioPrefs().muted);
    }, []),
  };
}

/**
 * Fires a sound when a number goes up, and never on the first render.
 *
 * Most race sounds are "one more of these happened" — a pit stop, an
 * overtake, a retirement — and the panels already hold those as counts.
 * Watching the count is far more reliable than trying to catch the event
 * on its way past, and it cannot double-fire on a re-render.
 */
export function useSoundOnIncrease(count: number, id: SoundId): void {
  const play = useSound();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (previous.current !== null && count > previous.current) play(id);
    previous.current = count;
  }, [count, id, play]);
}
