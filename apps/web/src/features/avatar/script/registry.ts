/**
 * v3.0 剧本引擎 T0.5：场景注册表。
 *
 * id 索引供 Director.play 使用；触发键索引按 priority 升序（数值小=优先级高），
 * 后续接入 Resolver 时可直接取同键候选。重复 id 保留后者并 warn（导入校验层再拦截）。
 */

import type { Scene } from '@wbfm/shared/schemas';

const EMPTY: readonly Scene[] = [];

export interface SceneRegistry {
  get(id: string): Scene | null;
  byTrigger(trigger: string): readonly Scene[];
  list(): readonly Scene[];
}

export function createSceneRegistry(scenes: readonly Scene[]): SceneRegistry {
  const byId = new Map<string, Scene>();
  const triggerIndex = new Map<string, Scene[]>();
  for (const scene of scenes) {
    if (byId.has(scene.id)) console.warn('[SceneRegistry] 重复 scene id:', scene.id);
    byId.set(scene.id, scene);
    for (const trigger of scene.triggers) {
      const list = triggerIndex.get(trigger);
      if (list) list.push(scene);
      else triggerIndex.set(trigger, [scene]);
    }
  }
  for (const list of triggerIndex.values()) list.sort((a, b) => a.priority - b.priority);
  return {
    get: (id) => byId.get(id) ?? null,
    byTrigger: (trigger) => triggerIndex.get(trigger) ?? EMPTY,
    list: () => scenes,
  };
}
