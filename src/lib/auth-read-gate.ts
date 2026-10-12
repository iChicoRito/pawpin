import { Platform } from 'react-native';

import { authStorage } from './auth-storage';

type PendingRead = {
  promise: Promise<string | null>;
  resolve: (value: string | null) => void;
  reading: boolean;
  attempts: number;
  revision: number;
  retry?: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingRead>();
const mutations = new Map<string, number>();

async function attempt(key: string, read: PendingRead): Promise<void> {
  if (read.reading || mutations.has(key) || pending.get(key) !== read) return;
  read.reading = true;
  const revision = read.revision;
  try {
    const value = await authStorage!.getItem(key);
    if (revision !== read.revision || mutations.has(key)) return;
    if (read.retry !== undefined) clearTimeout(read.retry);
    pending.delete(key);
    read.resolve(value);
  } catch {
    if (revision !== read.revision) return;
    // SDK initial subscribers do not catch storage rejection. Keep that read pending,
    // not signed out; the direct adapter still rejects and writes still fail normally.
    console.error('Secure auth read unavailable; restoration pending. Release verification required.');
    if (++read.attempts < 3) {
      read.retry = setTimeout(() => { read.retry = undefined; void attempt(key, read); }, 1000);
    }
  } finally {
    read.reading = false;
    if (revision !== read.revision) void attempt(key, read);
  }
}

export function retryPendingAuthReads(): void {
  for (const [key, read] of pending) {
    if (read.retry !== undefined) clearTimeout(read.retry);
    read.retry = undefined;
    // A foreground event grants a new finite retry budget, not an indefinite polling loop.
    read.attempts = 0;
    void attempt(key, read);
  }
}

async function mutate(key: string, operation: () => Promise<void>): Promise<void> {
  mutations.set(key, (mutations.get(key) ?? 0) + 1);
  const before = pending.get(key);
  if (before) before.revision++;
  try {
    await operation();
  } finally {
    const remaining = mutations.get(key)! - 1;
    if (remaining) mutations.set(key, remaining);
    else mutations.delete(key);
    const read = pending.get(key);
    if (read) {
      read.revision++;
      if (read.retry !== undefined) clearTimeout(read.retry);
      read.retry = undefined;
      read.attempts = 0;
      void attempt(key, read);
    }
  }
}

// Web storage (including the static-export undefined guard) passes through unchanged.
export const clientAuthStorage = Platform.OS === 'web' ? authStorage : {
  getItem(key: string): Promise<string | null> {
    const existing = pending.get(key);
    if (existing) return existing.promise;
    let resolve!: PendingRead['resolve'];
    const promise = new Promise<string | null>((complete) => { resolve = complete; });
    const read: PendingRead = { promise, resolve, reading: false, attempts: 0, revision: 0 };
    pending.set(key, read);
    void attempt(key, read);
    return promise;
  },
  setItem(key: string, value: string): Promise<void> {
    return mutate(key, () => authStorage!.setItem(key, value));
  },
  removeItem(key: string): Promise<void> {
    return mutate(key, () => authStorage!.removeItem(key));
  },
};
