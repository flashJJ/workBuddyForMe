import { openWithKey, sealWithKey } from './crypto-box';
import {
  finalizeKeyring,
  loadOrCreateKeyring,
  rotateKeyring,
  syncLegacyMasterKey,
  type LoadedKeyring,
} from './master-keyring';

/** 对称加解密抽象：Web 用本地主密钥；Electron 用主进程注入的 safeStorage 桥 */
export interface SecretCipher {
  /** v2.15：轮换模式；旧测试替身可省略，服务层按 web 处理 */
  readonly mode?: 'web' | 'desktop';
  /** v2.15：加密能力是否可用；省略视为可用 */
  isAvailable?(): boolean;
  encrypt(plaintext: string): string;
  /** 密文损坏/无法解密返回 null（降级为未配置，不崩溃） */
  decrypt(ciphertext: string): string | null;
  /** v2.15 Web：生成新 active key 并写入 keyring；返回新 key id */
  rotateKey?(): string;
  /** v2.15 Web：轮换结束后裁剪 fallback */
  finalizeKeyRotation?(clean: boolean): void;
  /** v2.15 Web：把 active key 同步到旧 master.key；失败返回 false */
  syncLegacyKey?(): boolean;
}

/** Electron 主进程 safeStorage IPC 桥（由 desktop 启动时注入） */
export interface SafeStorageBridge {
  encryptString(plaintext: string): string;
  decryptString(ciphertext: string): string;
  isEncryptionAvailable(): boolean;
}

/** Web 模式：AES-256-GCM + keys/master-keyring.json（兼容旧 master.key） */
export function createWebCipher(): SecretCipher {
  let state: LoadedKeyring | null = null;
  const getState = () => {
    if (!state) state = loadOrCreateKeyring();
    return state;
  };
  const getActiveKey = () => {
    const current = getState();
    const entry = current.keys.find((item) => item.id === current.activeKeyId);
    if (!entry) throw new Error('keyring active key 丢失');
    return entry.key;
  };
  return {
    mode: 'web',
    isAvailable: () => true,
    encrypt: (plaintext) => sealWithKey(plaintext, getActiveKey()),
    decrypt: (ciphertext) => {
      const current = getState();
      const ordered = [
        current.keys.find((item) => item.id === current.activeKeyId)!,
        ...current.keys.filter((item) => item.id !== current.activeKeyId),
      ];
      for (const entry of ordered) {
        if (!entry) continue;
        const plain = openWithKey(ciphertext, entry.key);
        if (plain !== null) return plain;
      }
      return null;
    },
    rotateKey: () => {
      const rotated = rotateKeyring(getState());
      state = rotated.state;
      return rotated.keyId;
    },
    finalizeKeyRotation: (clean) => {
      state = finalizeKeyring(getState(), clean);
    },
    syncLegacyKey: () => syncLegacyMasterKey(getActiveKey()),
  };
}

/** Electron 模式：加解密全部发生在主进程，渲染/服务层只持有密文 */
export function createBridgedCipher(bridge: SafeStorageBridge): SecretCipher {
  return {
    mode: 'desktop',
    isAvailable: () => bridge.isEncryptionAvailable(),
    encrypt: (plaintext) => bridge.encryptString(plaintext),
    decrypt: (ciphertext) => {
      try {
        if (!bridge.isEncryptionAvailable()) return null;
        return bridge.decryptString(ciphertext);
      } catch {
        return null;
      }
    },
  };
}

/** API Key 脱敏：sk-abcd1234efgh → sk-****efgh */
export function maskSecret(secret: string): string | null {
  if (!secret) return null;
  const head = secret.slice(0, 3);
  const tail = secret.slice(-4);
  return `${head}****${tail}`;
}
