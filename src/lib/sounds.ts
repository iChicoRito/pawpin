export type SoundKind = 'success' | 'error' | 'notification' | 'confirmation';

type Connection = {
  play: (kind: SoundKind) => Promise<void>;
  stop: () => void;
  active: boolean;
  playing: boolean;
  queue: SoundKind[];
  seen: Set<string>;
  recent: Partial<Record<SoundKind, number>>;
};

let connection: Connection | undefined;

/** The root owns audio players; feedback must never hold up an app action. */
export function connectSounds(play: Connection['play'], stop: Connection['stop']) {
  const current: Connection = {
    play, stop, active: true, playing: false, queue: [], seen: new Set(), recent: {},
  };
  connection = current;
  return () => {
    current.active = false;
    current.queue.length = 0;
    current.stop();
    if (connection === current) connection = undefined;
  };
}

export function setSoundsActive(active: boolean) {
  if (!connection) return;
  connection.active = active;
  if (!active) {
    connection.queue.length = 0;
    connection.recent = {};
    connection.stop();
  }
}

async function drain(current: Connection) {
  current.playing = true;
  try {
    while (current.active && connection === current && current.queue.length) {
      const kind = current.queue.shift()!;
      try {
        await current.play(kind);
      } catch (error) {
        // Audio failure cannot become another error sound or fail the report it accompanies.
        console.warn('Playing feedback failed:', error);
      }
    }
  } finally {
    current.playing = false;
  }
}

/** IDs deduplicate realtime/push delivery, not different reports from the same person. */
export function playSound(kind: SoundKind, eventId?: string) {
  const current = connection;
  if (!current?.active) return;
  if (eventId) {
    if (current.seen.has(eventId)) return;
    current.seen.add(eventId);
    // Keep the newest deliveries without accumulating every report for a long-lived session.
    if (current.seen.size > 512) current.seen.delete(current.seen.values().next().value!);
  } else if (kind === 'error') {
    const now = Date.now();
    // A toast and its inline message often appear together. One cue for that one action.
    if (now - (current.recent[kind] ?? -Infinity) < 250) return;
    current.recent[kind] = now;
  }
  current.queue.push(kind);
  if (!current.playing) void drain(current);
}
