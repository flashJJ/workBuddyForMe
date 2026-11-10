/**
 * v3.0 剧本引擎：Preset（可复用 cue 组合，纯数据）。
 *
 * Preset 由角色包以 JSON 提供，只能组合白名单 cue，不能携带逻辑；
 * pose cue 通过 preset id 引用本文件定义的组合。解析保持线性查找（数量级为个位）。
 */

import { z } from 'zod';
import { beatsSchema } from './scene';

export const presetSchema = z.object({
  id: z.string().trim().min(1).max(80),
  /** 相对毫秒时间轴（与 Scene beat 同一口径，非空且升序） */
  beats: beatsSchema,
});

export type Preset = z.infer<typeof presetSchema>;

/** 按 id 解析 preset；未命中原样返回 null（调用方 warn 后跳过该 cue） */
export function resolvePreset(presets: readonly Preset[], id: string): Preset | null {
  return presets.find((preset) => preset.id === id) ?? null;
}
