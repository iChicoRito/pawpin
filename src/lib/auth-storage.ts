import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CHUNK_BYTES = 1536;
const MAX_CHUNKS = 256;
type Slot = 0 | 1;
type Manifest = {
  version: 1;
  active: { slot: Slot; count: number; length: number } | null;
  slots: [number, number];
  deleted: boolean;
};

const queues = new Map<string, Promise<void>>();

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) ?? Promise.resolve()).then(operation);
  const tail = result.then(() => {}, () => {});
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return result;
}

function storageKey(key: string): string {
  // Fixed-width UTF-16 hex is reversible, collision-free, and uses only allowed characters.
  let encoded = 'pawpin.auth.v1.';
  for (let i = 0; i < key.length; i++) encoded += key.charCodeAt(i).toString(16).padStart(4, '0');
  return encoded;
}

function chunks(value: string): string[] {
  const result: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) {
      result.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  result.push(chunk);
  if (result.length > MAX_CHUNKS) throw new Error('Secure auth storage payload exceeds bounded capacity');
  return result;
}

function count(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_CHUNKS;
}

async function readManifest(base: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(`${base}.manifest`);
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed || parsed.version !== 1 || typeof parsed.deleted !== 'boolean' ||
      !Array.isArray(parsed.slots) || parsed.slots.length !== 2 || !parsed.slots.every(count) ||
      (parsed.active !== null && (!parsed.active || ![0, 1].includes(parsed.active.slot) ||
        !count(parsed.active.count) || parsed.active.count < 1 ||
        parsed.active.count > parsed.slots[parsed.active.slot] ||
        !Number.isInteger(parsed.active.length) || parsed.active.length < 0)) ||
      (parsed.deleted && parsed.active !== null)) {
    throw new Error('Invalid secure auth storage manifest');
  }
  return parsed;
}

async function writeManifest(base: string, manifest: Manifest): Promise<void> {
  const raw = JSON.stringify(manifest);
  await SecureStore.setItemAsync(`${base}.manifest`, raw);
  if (await SecureStore.getItemAsync(`${base}.manifest`) !== raw) {
    throw new Error('Secure auth storage manifest verification failed');
  }
}

async function readValue(base: string, active: NonNullable<Manifest['active']>): Promise<string> {
  let value = '';
  for (let i = 0; i < active.count; i++) {
    const chunk = await SecureStore.getItemAsync(`${base}.${active.slot}.chunk.${i}`);
    if (chunk === null) throw new Error('Incomplete secure auth storage value');
    value += chunk;
  }
  if (value.length !== active.length) throw new Error('Invalid secure auth storage value length');
  return value;
}

async function writeValue(base: string, value: string): Promise<void> {
  const parts = chunks(value);
  const manifest = await readManifest(base) ?? { version: 1, active: null, slots: [0, 0], deleted: false };
  const slot: Slot = manifest.active?.slot === 0 ? 1 : 0;
  // Record the high-water mark before any writes: signout can find even interrupted chunks.
  manifest.slots[slot] = Math.max(manifest.slots[slot], parts.length);
  await writeManifest(base, manifest);
  for (let i = 0; i < parts.length; i++) {
    const chunkKey = `${base}.${slot}.chunk.${i}`;
    await SecureStore.setItemAsync(chunkKey, parts[i]);
    if (await SecureStore.getItemAsync(chunkKey) !== parts[i]) {
      throw new Error('Secure auth storage chunk verification failed');
    }
  }
  const active = { slot, count: parts.length, length: value.length };
  if (await readValue(base, active) !== value) throw new Error('Secure auth storage verification failed');
  // The only commit point. No previous active chunk is changed before the new value is readable.
  await writeManifest(base, { ...manifest, active, deleted: false });
  if (await readValue(base, active) !== value) throw new Error('Secure auth storage verification failed');
}

function warnMigration(): void {
  // Native exception messages can contain credentials or keys; never log the original error.
  console.warn('Secure auth storage migration incomplete; existing account retained. Release verification required.');
}

export const authStorage = {
  getItem(key: string): Promise<string | null> {
    return serialize(key, async () => {
      const base = storageKey(key);
      let manifest: Manifest | null;
      try {
        manifest = await readManifest(base);
        if (manifest?.deleted) return null;
        if (manifest?.active) {
          const value = await readValue(base, manifest.active);
          try { await AsyncStorage.removeItem(key); } catch { warnMigration(); }
          return value;
        }
      } catch {
        const legacy = await AsyncStorage.getItem(key);
        if (legacy !== null) { warnMigration(); return legacy; }
        throw new Error('Secure auth storage unavailable; account restoration blocked');
      }
      const legacy = await AsyncStorage.getItem(key);
      if (legacy === null) {
        if (manifest) throw new Error('Incomplete secure auth storage; account restoration blocked');
        return null;
      }
      try {
        await writeValue(base, legacy);
        await AsyncStorage.removeItem(key);
      } catch { warnMigration(); }
      return legacy;
    });
  },
  setItem(key: string, value: string): Promise<void> {
    return serialize(key, async () => {
      await writeValue(storageKey(key), value);
      // Failure here leaves the verified secure copy authoritative; no plaintext writes occur.
      try { await AsyncStorage.removeItem(key); } catch { warnMigration(); }
    });
  },
  removeItem(key: string): Promise<void> {
    return serialize(key, async () => {
      const base = storageKey(key);
      const manifest = await readManifest(base);
      await AsyncStorage.removeItem(key);
      if (!manifest) return;
      // Intentional signout is atomic at this tombstone, not at individual chunk deletions.
      await writeManifest(base, { ...manifest, active: null, deleted: true });
      for (const slot of [0, 1] as const) {
        for (let i = 0; i < manifest.slots[slot]; i++) {
          await SecureStore.deleteItemAsync(`${base}.${slot}.chunk.${i}`);
        }
      }
      await SecureStore.deleteItemAsync(`${base}.manifest`);
    });
  },
};
