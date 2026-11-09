import type { StageSlot } from '@wbfm/shared/schemas';

/**
 * pixi-live2d-display 的 `autoUpdate` setter 不去重：每次赋 true 都会向
 * `Ticker.shared` 再注册一次 onTickerUpdate。舞台拖动角色时 StageRoot 每个
 * pointermove 都会重渲染并触发 update → 若每次都重新赋 true，回调会成倍叠加，
 * 动作按倍数加速（v2.24 用户反馈的“全屏舞台失速”）。
 *
 * 这里用「已应用值」做差量同步：只有真正切换档位/焦点时才触达第三方 setter。
 */

type AutoUpdateTarget = { autoUpdate: boolean };

/** 目标值：全 Live2D 档全部更新；省电档只更新聚焦槽 */
export function desiredAutoUpdate(
  powerMode: 'live' | 'portrait',
  focus: StageSlot | null,
  slot: StageSlot,
): boolean {
  return powerMode === 'live' || focus === slot;
}

/** 返回新的已应用值；与目标一致时绝不重复赋值 */
export function syncAutoUpdate(
  model: AutoUpdateTarget,
  applied: boolean | null,
  desired: boolean,
): boolean {
  if (applied === desired) return applied;
  model.autoUpdate = desired;
  return desired;
}
