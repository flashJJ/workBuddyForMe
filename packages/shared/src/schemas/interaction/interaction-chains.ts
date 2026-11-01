/**
 * v2.3：交互动画图的**动作条目目录**（id → 动作链工厂）。
 *
 * 动作链内容仍是代码，动画图条目只引用 id —— 因此整张图可 JSON 化持久化。
 * 与 interaction-graph（条目/条件/匹配）分离，两边都守 shared 包 ≤240 行约定。
 */

import type { ActionChain } from './interaction-actions';
import type { TouchRegion } from './interaction-events';

/** 内置动作条目 id（配置与 UI 的下拉真源） */
export const ACTION_CHAIN_IDS = [
  'head-tap',
  'head-longpress',
  'body-tap',
  'body-longpress',
  'body-double',
  'raised-tap',
  'notice',
  'cheer',
] as const;
export type ActionChainId = (typeof ACTION_CHAIN_IDS)[number];

/** 动作条目目录：id → 动作链工厂（每次调用产出新的 ActionChain） */
export const ACTION_CHAINS: Record<ActionChainId, () => ActionChain> = {
  'head-tap': () => ({
    actions: [
      { type: 'interaction.start', kind: 'head-touch' },
      { type: 'controller.playSquash' },
      // 点击头部顺带随机播一个一次性动作（动作池为空时 controller 内部走程序化回退）
      { type: 'controller.tap' },
      { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
    ],
    priority: 'normal',
    cooldownMs: 500,
  }),
  'head-longpress': () => ({
    actions: [
      { type: 'interaction.start', kind: 'head-touch' },
      { type: 'controller.playSquash', scaleX: 1.06, scaleY: 0.96, durationMs: 400 },
      { type: 'controller.flashExpression', tag: 'surprise', durationMs: 4200 },
    ],
    priority: 'high',
    cooldownMs: 1000,
  }),
  // body 区域：微弹 + smirk + 俏皮短句（幅度减半，因为身体比头部「钝」）
  'body-tap': () => ({
    actions: [
      { type: 'interaction.start', kind: 'body-touch' },
      { type: 'controller.playSquash', scaleX: 1.02, scaleY: 0.98, durationMs: 160 },
      { type: 'controller.tap' },
      { type: 'controller.flashExpression', tag: 'smirk', durationMs: 1800 },
    ],
    priority: 'normal',
    cooldownMs: 800,
  }),
  'body-longpress': () => ({
    actions: [
      { type: 'interaction.start', kind: 'body-touch' },
      { type: 'controller.playSquash', scaleX: 1.03, scaleY: 0.97, durationMs: 200 },
      { type: 'controller.flashExpression', tag: 'joy', durationMs: 2400 },
    ],
    priority: 'normal',
    cooldownMs: 1600,
  }),
  // body 双击：角色动作（与头部盒双击「回主窗」的窗口行为分开）
  // 双击必经单击，squash 包络若在此再触发会「重置回弹起点」造成抖动，故这里只加深反馈，不重复 squash
  'body-double': () => ({
    actions: [
      { type: 'interaction.start', kind: 'body-touch' },
      { type: 'controller.setExpression', tag: 'smirk' },
      { type: 'controller.tap' },
      { type: 'controller.flashExpression', tag: 'joy', durationMs: 1400 },
    ],
    priority: 'normal',
    cooldownMs: 1600,
  }),
  // raised：提起小区域触发「被提起」动作（需要搭档以上）
  'raised-tap': () => ({
    actions: [
      { type: 'interaction.start', kind: 'raised' },
      { type: 'controller.playSquash', scaleX: 0.94, scaleY: 1.08, durationMs: 300 },
      { type: 'controller.flashExpression', tag: 'surprise', durationMs: 2000 },
    ],
    priority: 'high',
    cooldownMs: 1500,
  }),

  // ── 非触摸事件的默认表现（P2-2 内置条目用）────────────────────────
  // 都不含 interaction.start：没人碰它，不该驱动「入场/循环/退场」三段式。
  // 察觉到：只换一下表情、不动身体——「抬头看一眼」的轻反馈
  'notice': () => ({
    actions: [{ type: 'controller.flashExpression', tag: 'surprise', durationMs: 1600 }],
    priority: 'normal',
    cooldownMs: 4000,
  }),
  // 高兴一下：播动作池里一个一次性动作 + 开心表情（欢迎回来 / 关系升级庆祝）
  'cheer': () => ({
    actions: [
      { type: 'controller.tap' },
      { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
    ],
    priority: 'normal',
    cooldownMs: 5000,
  }),
};

/** 条目 → 动作链（条目引用目录内 id） */
export function chainOf(entry: { chainId: ActionChainId }): ActionChain {
  return ACTION_CHAINS[entry.chainId]();
}

/** 冷却 per region（ms）：触摸事件的门控口径 */
export const DEFAULT_COOLDOWN = {
  head: 500,
  body: 800,
  raised: 1500,
  pinch: 2000,
  unknown: 800,
} as const satisfies Record<TouchRegion, number>;
