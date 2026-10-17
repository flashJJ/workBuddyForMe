/**
 * VRMA 文件双校验（魔数 + VRM Animation 扩展标记）
 * 与 sniffVrm 同口径：仅收 glb 容器且必须含 VRMC_vrm_animation 扩展。
 */

import { isGlbContainer, readExtensionsUsed, readGlbJson } from './glb';

export interface VrmaSniffResult {
  ok: boolean;
  reason?: 'not_glb' | 'not_vrma_extension' | 'parse_failed';
}

export function sniffVrma(buffer: ArrayBuffer): VrmaSniffResult {
  if (!isGlbContainer(buffer)) return { ok: false, reason: 'not_glb' };
  const json = readGlbJson(buffer);
  if (!json) return { ok: false, reason: 'parse_failed' };
  if (!readExtensionsUsed(json).includes('VRMC_vrm_animation')) {
    return { ok: false, reason: 'not_vrma_extension' };
  }
  return { ok: true };
}

export interface VrmaMeta {
  /** 生成器（asset.generator，可选） */
  generator?: string;
  /** 动画条数 */
  animationCount: number;
  /** 首个动画时长（秒，可选） */
  duration?: number;
}

/** 提取 VRMA 元数据（生成器/动画条数/首个动画时长）。VRMA 无许可字段，不臆造 */
export function extractVrmaMeta(buffer: ArrayBuffer): VrmaMeta {
  const json = readGlbJson(buffer) ?? {};
  const animations = (json.animations ?? []) as Array<{ samplers?: Array<{ input?: number }> }>;
  const accessors = (json.accessors ?? []) as Array<{ max?: number[] }>;
  // 首个动画时长：取首个采样器 input accessor 的 max 上界（时间轴单位秒）
  let duration: number | undefined;
  const inputIndex = animations[0]?.samplers?.[0]?.input;
  if (typeof inputIndex === 'number') {
    const max = accessors[inputIndex]?.max?.[0];
    if (typeof max === 'number' && Number.isFinite(max)) duration = max;
  }
  return {
    generator: (json.asset as { generator?: string } | undefined)?.generator ?? undefined,
    animationCount: animations.length,
    duration,
  };
}
