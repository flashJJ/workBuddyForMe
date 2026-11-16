/**
 * 道具 manifest（S2/S4/S5）：运行时只认这里的 id，剧本/AI 不能引用未登记资产。
 *
 * 当前 GLB 为项目自建占位资产（CC0-1.0），由
 * `scripts/avatar/generate-props.mjs` 生成；替换外部 CC0 GLB 时保持文件名与原点约定即可。
 */
import type { PropPackKind, PropPackLicense } from '@wbfm/shared/schemas';
import type { PropAnimationId } from './prop-animation';

export type PropLicense = PropPackLicense;
export type PropKind = PropPackKind;

export interface PropSpec {
  id: string;
  /** public 下的 GLB 路径 */
  url: string;
  /** hand = 挂 raw hand；stage = 挂渲染场景根节点 */
  kind: PropKind;
  license: PropLicense;
  /** hand：原点相对掌心沿掌心法线的距离（米） */
  contact?: number;
  /** hand：掌侧向偏移（米） */
  lateral?: number;
  /** hand：默认持物姿态（手臂 + 手指） */
  handPose?: string;
  /** 资产尺度（1 = 原始米制） */
  scale?: number;
  /** hand：朝向修正（绕世界 Y，弧度） */
  yaw?: number;
  /** stage：场景坐标（米），原点在道具底部中心 */
  position?: [number, number, number];
  /** stage：绕 Y 朝向（弧度） */
  rotationY?: number;
  /** S5：道具自身动画（白名单，运行时按 id 采样） */
  animation?: PropAnimationId;
}

const PROP_HOLD = 'pose.prop-hold';
const CC0 = 'CC0-1.0' as const;

/** v4.3 M3：内置道具与包内道具共用同一注册表结构 */
export type PropRegistry = Readonly<Record<string, PropSpec>>;

export const PROPS: PropRegistry = {
  teacup: {
    id: 'teacup',
    url: '/props/teacup.glb',
    kind: 'hand',
    license: CC0,
    contact: 0.048,
    lateral: 0.022,
    handPose: PROP_HOLD,
    animation: 'pour',
  },
  bowl: {
    id: 'bowl',
    url: '/props/bowl.glb',
    kind: 'hand',
    license: CC0,
    contact: 0.03,
    lateral: 0.012,
    handPose: PROP_HOLD,
  },
  book: {
    id: 'book',
    url: '/props/book.glb',
    kind: 'hand',
    license: CC0,
    contact: 0.1,
    lateral: 0.014,
    handPose: PROP_HOLD,
    animation: 'flip',
  },
  table: {
    id: 'table',
    url: '/props/table.glb',
    kind: 'stage',
    license: CC0,
    position: [0.28, 0, -0.15],
    rotationY: -0.35,
    scale: 0.75,
  },
  phone: {
    id: 'phone',
    url: '/props/phone.glb',
    kind: 'hand',
    license: CC0,
    contact: 0.022,
    lateral: 0.008,
    handPose: PROP_HOLD,
    yaw: 0.45,
  },
  flower: {
    id: 'flower',
    url: '/props/flower.glb',
    kind: 'hand',
    license: CC0,
    contact: 0.02,
    lateral: 0.006,
    handPose: PROP_HOLD,
    yaw: 0.3,
  },
  cushion: {
    id: 'cushion',
    url: '/props/cushion.glb',
    kind: 'stage',
    license: CC0,
    position: [-0.3, 0, -0.12],
    rotationY: 0.25,
  },
  lamp: {
    id: 'lamp',
    url: '/props/lamp.glb',
    kind: 'stage',
    license: CC0,
    position: [-0.42, 0, -0.2],
    rotationY: 0.4,
  },
};

export const PROP_IDS = Object.keys(PROPS);
