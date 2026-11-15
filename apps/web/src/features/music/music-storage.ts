/** 导入歌曲的本地持久化：优先 IndexedDB，不可用时退回内存（仅当前会话） */

import type { MusicMood, MusicTrack } from './music-tracks';

const DB_NAME = 'wbfm-music';
const STORE = 'tracks';
const DB_VERSION = 1;

/** 单曲上限：40MB，覆盖常见 320kbps 的 10 分钟曲目 */
export const MUSIC_MAX_BYTES = 40 * 1024 * 1024;

interface StoredTrack {
  id: string;
  title: string;
  mood: MusicMood;
  fileName: string;
  mime: string;
  size: number;
  addedAt: number;
  blob: Blob;
}

const memory = new Map<string, StoredTrack>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function toTrack(record: StoredTrack): MusicTrack {
  return {
    id: record.id,
    title: record.title,
    mood: record.mood,
    source: 'imported',
    fileName: record.fileName,
    size: record.size,
    addedAt: record.addedAt,
  };
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || name;
}

export async function listImportedMusic(): Promise<MusicTrack[]> {
  const db = await openDb();
  if (!db) {
    return [...memory.values()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(toTrack);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        const records = (request.result ?? []) as StoredTrack[];
        resolve(records.sort((a, b) => b.addedAt - a.addedAt).map(toTrack));
      };
      request.onerror = () => resolve([...memory.values()].map(toTrack));
    } catch {
      resolve([...memory.values()].map(toTrack));
    }
  });
}

export async function saveImportedMusic(
  file: File,
  mood: MusicMood,
): Promise<MusicTrack> {
  if (file.size <= 0) throw new Error('empty');
  if (file.size > MUSIC_MAX_BYTES) throw new Error('too-large');
  const addedAt = Date.now();
  const record: StoredTrack = {
    id: `imported-${addedAt}-${Math.random().toString(36).slice(2, 8)}`,
    title: stripExtension(file.name),
    mood,
    fileName: file.name,
    mime: file.type || 'audio/mpeg',
    size: file.size,
    addedAt,
    blob: file,
  };
  const db = await openDb();
  if (!db) {
    memory.set(record.id, record);
    return toTrack(record);
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('save-failed'));
      tx.onabort = () => reject(tx.error ?? new Error('save-aborted'));
    } catch (error) {
      reject(error);
    }
  });
  return toTrack(record);
}

export async function readImportedMusicBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return memory.get(id)?.blob ?? null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredTrack | undefined)?.blob ?? null);
      request.onerror = () => resolve(memory.get(id)?.blob ?? null);
    } catch {
      resolve(memory.get(id)?.blob ?? null);
    }
  });
}

export async function deleteImportedMusic(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
