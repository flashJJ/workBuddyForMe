import type { CapabilitySignaturePolicy, CapabilityTrustedKey } from '../schemas/capability';

/**
 * v2.12 能力包签名设置字段（单独成文件，避免 domain.ts 超出单文件 300 行上限）。
 * 由 AppSettings 交叉引入；默认值见 core settings-service（policy='warn'、keys=[]）。
 */
export interface CapabilitySignatureSettingsFields {
  /** 签名策略：off 跳过验签；warn 只拒无效签名；require 仅允许有效签名 */
  capabilitySignaturePolicy?: CapabilitySignaturePolicy;
  /** 本地信任公钥（≤20；PEM SPKI，可导入性由 core 服务端校验） */
  capabilityTrustedKeys?: CapabilityTrustedKey[];
}
