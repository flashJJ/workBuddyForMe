import {
  PROVIDER_PRESETS,
  type ProviderPreset,
  type VendorDiscovery,
  type VendorKeyScope,
} from '@wbfm/shared/constants';

/**
 * v2.17：厂商描述查询层。
 *
 * 数据仍放在 `@wbfm/shared/constants` 的 `PROVIDER_PRESETS`，因为设置页与 onboarding
 * 需要同一份描述；本文件只做按 id / Base URL 的匹配与缺省策略解析，不复制数据。
 */
export type VendorDescriptor = ProviderPreset;
export type { VendorDiscovery, VendorKeyScope };

/** 全部厂商描述（与 UI 预设同一份数据） */
export function listVendors(): readonly VendorDescriptor[] {
  return PROVIDER_PRESETS;
}

/** 按 id 查找厂商描述；未知 id 返回 null */
export function getVendor(id: string | null | undefined): VendorDescriptor | null {
  if (!id) return null;
  return PROVIDER_PRESETS.find((vendor) => vendor.id === id) ?? null;
}

/** 归一化 Base URL：去首尾空白、去尾部斜杠、统一小写 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').toLowerCase();
}

/** 按 Base URL 匹配已保存的供应商；用于没有存 vendor id 的历史记录 */
export function findVendorByBaseUrl(baseUrl: string | null | undefined): VendorDescriptor | null {
  if (!baseUrl) return null;
  const target = normalizeBaseUrl(baseUrl);
  return (
    PROVIDER_PRESETS.find((vendor) => normalizeBaseUrl(vendor.baseUrl) === target) ?? null
  );
}

/** 缺省发现策略：未声明时按 OpenAI 兼容的 /models 处理 */
export function resolveVendorDiscovery(
  vendor: VendorDescriptor | null | undefined,
): VendorDiscovery {
  return vendor?.discovery ?? 'openai-models';
}
