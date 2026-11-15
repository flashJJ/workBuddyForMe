/**
 * v3.0 剧本引擎 T0.3：确定性随机。
 *
 * 同一 (会话 seed, sceneId, playIndex) 必产出同一随机序列，
 * 用于 golden 重放与「同一输入两次播放结果一致」的回归。
 */

/** mulberry32：32 位状态、零依赖、分布足够剧本挑选台词/手势使用 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 变体：把 sceneId 混入基础 seed */
function hashSceneId(seed: number, sceneId: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < sceneId.length; i += 1) {
    hash = Math.imul(hash ^ sceneId.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** seed = 会话 seed ⊕ sceneId ⊕ playIndex（09 文档 §4.4 的确定性口径） */
export function deriveSeed(baseSeed: number, sceneId: string, playIndex: number): number {
  const mixed = Math.imul(hashSceneId(baseSeed, sceneId) ^ (playIndex + 1), 0x9e3779b1) >>> 0;
  return mixed >>> 0;
}

/** 派生并实例化随机源 */
export function sceneRandom(baseSeed: number, sceneId: string, playIndex: number): () => number {
  return mulberry32(deriveSeed(baseSeed, sceneId, playIndex));
}
