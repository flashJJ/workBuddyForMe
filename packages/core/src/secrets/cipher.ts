import { openWithKey, sealWithKey } from './crypto-box';
import { loadOrCreateMasterKey } from './master-key';

/** 对称加解密抽象：Web 用本地主密钥；Electron 用主进程注入的 safeStorage 桥 */
export interface SecretCipher {
  encrypt(plaintext: string): string;
  /** 密文损坏/无法解密返回 null（降级为未配置，不崩溃） */
  decrypt(ciphertext: string): string | null;
}

/** Electron 主进程 safeStorage IPC 桥（由 desktop 启动时注入） */
export interface SafeStorageBridge {
  encryptString(plaintext: string): string;
  decryptString(ciphertext: string): string;
  isEncryptionAvailable(): boolean;
}

/** Web 模式：AES-256-GCM + keys/master.key（0600） */
export function createWebCipher(): SecretCipher {
  let key: Buffer | null = null;
  const getKey = () => {
    if (!key) key = loadOrCreateMasterKey();
    return key;
  };
  return {
    encrypt: (plaintext) => sealWithKey(plaintext, getKey()),
    decrypt: (ciphertext) => openWithKey(ciphertext, getKey()),
  };
}

/** Electron 模式：加解密全部发生在主进程，渲染/服务层只持有密文 */
export function createBridgedCipher(bridge: SafeStorageBridge): SecretCipher {
  return {
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
