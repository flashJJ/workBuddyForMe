import type { DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';

/** 所有服务共享的依赖：数据库实例与密钥器 */
export interface ServiceDeps {
  db: DatabaseInstance;
  cipher: SecretCipher;
}
