import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { MASTER_KEY_FILENAME } from './master-key';

/**
 * v2.15 M3：Web 主密钥 keyring。
 * - 旧 keys/master.key（32 字节 raw）作为 legacy key 读入，兼容 v2.14；
 * - 轮换时先写 keyring（新 active + 旧 fallback），旧密文仍可解；
 * - 最多保留 3 把 key（active + 两个 fallback），干净轮换后裁剪到 active + previous。
 */
export const MASTER_KEYRING_FILENAME = 'master-keyring.json';
const KEY_LENGTH = 32;
const MAX_KEYS = 3;

export interface KeyringEntry {
  id: string;
  key: Buffer;
  createdAt: string;
}

export interface LoadedKeyring {
  activeKeyId: string;
  keys: KeyringEntry[];
  source: 'keyring' | 'legacy' | 'created';
}

interface SerializedKeyring {
  formatVersion: 1;
  activeKeyId: string;
  keys: Array<{ id: string; key: string; createdAt: string; retiredAt: string | null }>;
}

function keysDir(): string {
  return getDataDir('keys');
}

function atomicWrite(file: string, data: string | Buffer, mode = 0o600): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, data, { mode });
    chmodSync(tmp, mode);
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* 临时文件可能未创建 */
    }
    throw error;
  }
}

function serialize(state: LoadedKeyring): string {
  const payload: SerializedKeyring = {
    formatVersion: 1,
    activeKeyId: state.activeKeyId,
    keys: state.keys.map((entry) => ({
      id: entry.id,
      key: entry.key.toString('base64'),
      createdAt: entry.createdAt,
      retiredAt: null,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function writeKeyring(state: LoadedKeyring): void {
  atomicWrite(join(keysDir(), MASTER_KEYRING_FILENAME), serialize(state));
}

function parseSerialized(raw: unknown): LoadedKeyring {
  if (!raw || typeof raw !== 'object') throw new Error('keyring 格式非法');
  const value = raw as Partial<SerializedKeyring>;
  if (value.formatVersion !== 1) throw new Error('keyring formatVersion 非法');
  if (typeof value.activeKeyId !== 'string' || !value.activeKeyId) {
    throw new Error('keyring activeKeyId 非法');
  }
  if (!Array.isArray(value.keys) || value.keys.length === 0) {
    throw new Error('keyring keys 为空');
  }
  const seen = new Set<string>();
  const keys: KeyringEntry[] = value.keys.map((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id) {
      throw new Error('keyring key id 非法');
    }
    if (seen.has(entry.id)) throw new Error('keyring key id 重复');
    seen.add(entry.id);
    if (typeof entry.key !== 'string') throw new Error('keyring key 非法');
    const key = Buffer.from(entry.key, 'base64');
    if (key.length !== KEY_LENGTH) throw new Error('keyring key 长度非法');
    return {
      id: entry.id,
      key,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    };
  });
  if (!seen.has(value.activeKeyId)) throw new Error('keyring activeKeyId 不在 keys 中');
  return { activeKeyId: value.activeKeyId, keys, source: 'keyring' };
}

function readLegacyKey(): Buffer {
  const file = join(keysDir(), MASTER_KEY_FILENAME);
  const raw = readFileSync(file);
  if (raw.length !== KEY_LENGTH) {
    throw new Error('主密钥文件长度异常，为避免数据损坏请检查 keys/master.key');
  }
  return raw;
}

function newKeyId(): string {
  return `k-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function newEntry(): KeyringEntry {
  return {
    id: newKeyId(),
    key: randomBytes(KEY_LENGTH),
    createdAt: new Date().toISOString(),
  };
}

/** 读取 keyring；不存在时优先迁移 legacy master.key，否则创建新 keyring + master.key */
export function loadOrCreateKeyring(): LoadedKeyring {
  const dir = keysDir();
  mkdirSync(dir, { recursive: true });
  const ringFile = join(dir, MASTER_KEYRING_FILENAME);
  if (existsSync(ringFile)) {
    return parseSerialized(JSON.parse(readFileSync(ringFile, 'utf8')) as unknown);
  }
  if (existsSync(join(dir, MASTER_KEY_FILENAME))) {
    return {
      activeKeyId: 'legacy',
      keys: [{ id: 'legacy', key: readLegacyKey(), createdAt: new Date().toISOString() }],
      source: 'legacy',
    };
  }

  const entry = newEntry();
  const state: LoadedKeyring = { activeKeyId: entry.id, keys: [entry], source: 'created' };
  writeKeyring(state);
  // 同时写旧文件，保证新装 v2.15 回退到 v2.14 仍可解密
  atomicWrite(join(dir, MASTER_KEY_FILENAME), entry.key);
  return state;
}

/** 生成新 key、设为 active 并原子写 keyring；保留 active + 最近一个 fallback + 新 key */
export function rotateKeyring(state: LoadedKeyring): { state: LoadedKeyring; keyId: string } {
  const entry = newEntry();
  const active = state.keys.find((item) => item.id === state.activeKeyId);
  if (!active) throw new Error('keyring active key 丢失');
  const fallback = state.keys.find((item) => item.id !== state.activeKeyId);
  const keys = [entry, active, ...(fallback ? [fallback] : [])].slice(0, MAX_KEYS);
  const next: LoadedKeyring = { activeKeyId: entry.id, keys, source: 'keyring' };
  writeKeyring(next);
  return { state: next, keyId: entry.id };
}

/** 干净轮换后裁剪到 active + previous；失败轮换保留现有 fallback */
export function finalizeKeyring(state: LoadedKeyring, clean: boolean): LoadedKeyring {
  if (!clean) return state;
  const active = state.keys.find((item) => item.id === state.activeKeyId);
  if (!active) throw new Error('keyring active key 丢失');
  const previous = state.keys.find((item) => item.id !== state.activeKeyId);
  const next: LoadedKeyring = {
    activeKeyId: state.activeKeyId,
    keys: [active, ...(previous ? [previous] : [])],
    source: 'keyring',
  };
  writeKeyring(next);
  return next;
}

/** 把 active key 同步到旧 master.key（仅用于 v2.14 降级解密）；失败返回 false */
export function syncLegacyMasterKey(key: Buffer): boolean {
  try {
    atomicWrite(join(keysDir(), MASTER_KEY_FILENAME), key);
    return true;
  } catch {
    return false;
  }
}
