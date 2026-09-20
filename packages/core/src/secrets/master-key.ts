import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getDataDir } from '@wbfm/config';

export const MASTER_KEY_FILENAME = 'master.key';
const KEY_LENGTH = 32;

/** 读取 keys/master.key；不存在则创建并尽量收紧权限到 0600 */
export function loadOrCreateMasterKey(): Buffer {
  const dir = getDataDir('keys');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, MASTER_KEY_FILENAME);
  if (existsSync(file)) {
    const raw = readFileSync(file);
    if (raw.length === KEY_LENGTH) return raw;
    throw new Error('主密钥文件长度异常，为避免数据损坏请检查 keys/master.key');
  }
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(file, key, { mode: 0o600 });
  // Windows 下 chmod 仅影响只读位；ACL 由用户目录隔离，POSIX 下为真正的 0600
  chmodSync(file, 0o600);
  return key;
}
