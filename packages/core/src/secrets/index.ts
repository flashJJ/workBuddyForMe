/** @域 barrel 密钥与安全存储（v1.1 M2 域子路径化），根 barrel 聚合本面 */
export {
  createWebCipher,
  createBridgedCipher,
  maskSecret,
  type SecretCipher,
  type SafeStorageBridge,
} from './cipher';
export { sealWithKey, openWithKey } from './crypto-box';
export { loadOrCreateMasterKey, MASTER_KEY_FILENAME } from './master-key';
export {
  MASTER_KEYRING_FILENAME,
  finalizeKeyring,
  loadOrCreateKeyring,
  rotateKeyring,
  syncLegacyMasterKey,
  type KeyringEntry,
  type LoadedKeyring,
} from './master-keyring';
export { createSecretRotationService, type SecretRotationService } from './rotate';
