/**
 * 桌宠（M4 伴身）主进程 ↔ 渲染进程契约。
 *
 * 架构要点（见 docs/plan/v1.0/06-桌宠伴身方案.md）：
 * - 主窗保持唯一 chat/stream 订阅者与唯一 AudioContext；
 * - 桌宠窗是「瘦终端」：无麦克风、无聊天请求，表现数据全部经 IPC 中继；
 * - 主进程只做单窗转发，不缓存表现事件。
 *
 * 仅类型 + 一个纯函数，无运行时依赖（模型白名单为 voice schema 的 const 数组）。
 */
import { EXPRESSION_TAGS, type ExpressionTag } from './schemas/emotion/expression';
import { MOTION_MOODS, type MotionMood } from './schemas/media/motion-asset';
import {
  CONTEXT_TRIGGERS,
  SYSTEM_SIGNALS,
  TOUCH_GESTURES,
  TOUCH_REGIONS,
  type ContextTrigger,
  type InteractionEvent,
  type SystemSignal,
  type TouchGesture,
  type TouchRegion,
} from './schemas/interaction/interaction-events';
import { RELATIONSHIP_LEVEL_NAMES, type RelationshipLevel } from './schemas/chat/relationship-level';
import { RELATIONSHIP_LEVEL_MAX } from './constants/relationship';
import type { PetChatPromptKey, PetQuickAction } from './schemas/pet';

export {
  PET_CHAT_PROMPT_KEYS,
  PET_CHAT_REQUEST_CHANNEL,
  PET_QUICK_ACTIONS,
  isPetChatPromptKey,
  normalizeAvatarModelId,
} from './schemas/pet';
export type { PetChatPromptKey, PetQuickAction } from './schemas/pet';

/** 桌宠表现状态机（与语音状态机取值对齐） */
export type PetVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * 主窗 → 桌宠的表现事件（经主进程 pet-manager 单窗转发）。
 * - level：TTS 播放电平 0~1，仅播放期由音频线程回调驱动（约 30Hz），idle 不发；
 * - subtitle：当前朗读句（已剥表情标签、调用方限长）；
 * - expression：8 个规范表情标签之一；
 * - relationship：v2.2 状态快照（展示关系等级 0–3 + 情绪档位），驱动桌宠交互门控与待机动作挑选；
 * - interaction：v2.3 P2-2 归一化交互事件（感知/系统信号/关系变化）中继，由桌宠侧 Resolver
 *   按动画图配置决定是否表演（缺省无内置条目 → 不表演）；
 * - conversation：切换会话/重置，桌宠清空字幕与表情。
 */
export type PetPerformanceEvent =
  | { kind: 'level'; value: number }
  | { kind: 'state'; state: PetVoiceState }
  | { kind: 'subtitle'; text: string }
  | { kind: 'expression'; tag: string }
  | { kind: 'relationship'; level: number; mood: MotionMood }
  | { kind: 'interaction'; event: InteractionEvent }
  | { kind: 'conversation' };

/** 命中轮廓多边形（归一化窗口坐标 0..1，原点左上，顺时针；ui = dev 面板等非模型交互区） */
export interface PetHitPolygon {
  id: 'head' | 'body' | 'tail' | 'ui';
  points: Array<[number, number]>;
}

/**
 * v3.0 P0：渲染层上报的模型命中轮廓。
 *
 * 主进程把归一化点乘当前窗口 bounds 后做射线法判定，替代固定比例矩形，
 * 让角色两侧/头顶的透明区不再「空气可点」。上报时机：模型加载、窗口尺寸变化、换模型。
 */
export interface PetHitProxy {
  version: 1;
  polygons: PetHitPolygon[];
}

/** 单次上报的多边形数量/点数上限（IPC 安全边界） */
export const PET_HIT_PROXY_MAX_POLYGONS = 4;
export const PET_HIT_PROXY_MAX_POINTS = 32;

const HIT_POLYGON_IDS = new Set<string>(['head', 'body', 'tail', 'ui']);

/** 桌宠窗上报的伴身设置（右键菜单勾选态；主进程只缓存） */
export interface PetCompanionSettings { muted: boolean; proactive: boolean }
/**
 * preload 通过 contextBridge 暴露的桌宠桥（window.wbfm.pet）。
 * 主窗调用 open/close/isOpen/relayPerformance/onOpenChange；
 * 桌宠窗调用 reportHover/focusMain/onPerformance。
 * 不开放任何文件系统/壳能力。
 */
export interface WbfmPetBridge {
  /** 主窗：打开桌宠（幂等）；modelId 非法/缺省回落 haru；返回当前是否打开 */
  open(modelId?: string): Promise<boolean>;
  /** 主窗：关闭桌宠（幂等） */
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  /** 桌宠窗：命中盒悬停结果（穿透滞回输入；高频，主进程节流） */
  reportHover(hovering: boolean): void;
  /** 桌宠窗：上报模型命中轮廓（模型加载/尺寸变化时；null 回落固定矩形） */
  reportHitProxy(proxy: PetHitProxy | null): void;
  /** 桌宠窗：双击回主窗（主窗显示并聚焦）；可选站内路径用于工作/审批深链 */
  focusMain(path?: string): void;
  /**
   * 桌宠窗：手动拖拽（替代 -webkit-app-region:drag，避免系统拖拽层吞右键/双击）。
   * 位置完全由主进程读全局 DIP 光标决定，渲染端不发坐标（避免缩放像素错位）。
   * dragTo 是移动心跳（按住期间 mousemove 触发即可，无需参数）。
   */
  dragBegin(): void;
  dragTo(): void;
  dragEnd(): void;
  /** 桌宠窗：右键角色 → 请求主进程弹出菜单（渲染层显式上报） */
  showMenu(): void;
  /** 桌宠窗：上报当前静音/主动说话状态，供右键菜单显示勾选态 */
  reportCompanionSettings(settings: PetCompanionSettings): void;
  /** 主窗：中继语音表现事件（单窗转发；桌宠未开时主进程直接丢弃） */
  relayPerformance(event: PetPerformanceEvent): void;
  /**
   * 桌宠窗：订阅主进程的换模型通知（原位热替换，不重建窗口）。
   * 渲染层应用后必须 `confirmModel` 回执；主进程超时未收到回执会回退为重建窗口。
   */
  onModelChange(cb: (modelId: string) => void): () => void;
  /** 桌宠窗：换模型已应用回执（仅回执主进程最近一次通知的 modelId 有效） */
  confirmModel(modelId: string): void;
  /** 桌宠窗：订阅右键菜单快捷动作（静音 / 主动说话 / 场戏），返回取消订阅 */
  onQuickAction(cb: (action: PetQuickAction) => void): () => void;
  /** 桌宠窗：订阅表现事件，返回取消订阅 */
  onPerformance(cb: (event: PetPerformanceEvent) => void): () => void;
  /** 主窗：订阅桌宠开关状态（用于主窗形象栏让位），返回取消订阅 */
  onOpenChange(cb: (open: boolean) => void): () => void;
  /** 主窗：订阅桌宠「聊两句」语义键（只预填草稿，不自动发送），返回取消订阅 */
  onChatRequest(cb: (key: PetChatPromptKey) => void): () => void;
}

const PET_VOICE_STATES = ['idle', 'listening', 'thinking', 'speaking'] as const;
/** 中继字幕限长（调用方也会限；主进程兜底防异常长文本刷 IPC） */
export const PET_SUBTITLE_MAX = 120;
const TAG_SET = new Set<string>(EXPRESSION_TAGS);
const MOOD_SET = new Set<string>(MOTION_MOODS);
const REGION_SET = new Set<string>(TOUCH_REGIONS);
const GESTURE_SET = new Set<string>(TOUCH_GESTURES);
const CONTEXT_SET = new Set<string>(CONTEXT_TRIGGERS);
const SIGNAL_SET = new Set<string>(SYSTEM_SIGNALS);
const LEVEL_SET = new Set<string>(RELATIONSHIP_LEVEL_NAMES);

/**
 * 中继载荷里的 InteractionEvent 净化（IPC 是不可信边界，只放行枚举内的取值）。
 * 对话事件本版不接，一律丢弃。
 */
function sanitizeInteractionEvent(input: unknown): InteractionEvent | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  switch (record.kind) {
    case 'touch':
      return typeof record.region === 'string' &&
        REGION_SET.has(record.region) &&
        typeof record.gesture === 'string' &&
        GESTURE_SET.has(record.gesture)
        ? {
            kind: 'touch',
            region: record.region as TouchRegion,
            gesture: record.gesture as TouchGesture,
          }
        : null;
    case 'context':
      return typeof record.trigger === 'string' && CONTEXT_SET.has(record.trigger)
        ? { kind: 'context', trigger: record.trigger as ContextTrigger }
        : null;
    case 'system':
      return typeof record.signal === 'string' && SIGNAL_SET.has(record.signal)
        ? { kind: 'system', signal: record.signal as SystemSignal }
        : null;
    case 'relationship': {
      if (typeof record.level !== 'string' || !LEVEL_SET.has(record.level)) return null;
      const delta = Number(record.delta);
      if (!Number.isFinite(delta)) return null;
      return { kind: 'relationship', level: record.level as RelationshipLevel, delta };
    }
    default:
      return null;
  }
}

/**
 * 净化渲染进程中继上来的表现事件（主进程安全边界：不信任 IPC 载荷）。
 * 非法结构/未知 kind/越界数值一律丢弃（返回 null），不抛错。
 */
export function sanitizePetEvent(input: unknown): PetPerformanceEvent | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  switch (record.kind) {
    case 'level': {
      const value = Number(record.value);
      if (!Number.isFinite(value)) return null;
      return { kind: 'level', value: Math.min(1, Math.max(0, value)) };
    }
    case 'state': {
      return typeof record.state === 'string' &&
        (PET_VOICE_STATES as readonly string[]).includes(record.state)
        ? { kind: 'state', state: record.state as (typeof PET_VOICE_STATES)[number] }
        : null;
    }
    case 'subtitle': {
      return typeof record.text === 'string'
        ? { kind: 'subtitle', text: record.text.slice(0, PET_SUBTITLE_MAX) }
        : null;
    }
    case 'expression': {
      return typeof record.tag === 'string' && TAG_SET.has(record.tag)
        ? { kind: 'expression', tag: record.tag as ExpressionTag }
        : null;
    }
    case 'conversation':
      return { kind: 'conversation' };
    case 'interaction': {
      const event = sanitizeInteractionEvent(record.event);
      return event ? { kind: 'interaction', event } : null;
    }
    case 'relationship': {
      const level = Number(record.level);
      if (!Number.isFinite(level)) return null;
      if (typeof record.mood !== 'string' || !MOOD_SET.has(record.mood)) return null;
      return {
        kind: 'relationship',
        level: Math.min(RELATIONSHIP_LEVEL_MAX, Math.max(0, Math.round(level))),
        mood: record.mood as MotionMood,
      };
    }
    default:
      return null;
  }
}

/** 射线法：点是否在多边形内（坐标同尺度，支持任意凸/凹多边形） */
export function pointInPolygon(
  x: number,
  y: number,
  points: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 归一化点是否落在任一命中多边形内 */
export function isPointInPetHitProxy(
  nx: number,
  ny: number,
  proxy: PetHitProxy | null | undefined,
): boolean {
  if (!proxy || proxy.polygons.length === 0) return false;
  return proxy.polygons.some((polygon) => pointInPolygon(nx, ny, polygon.points));
}

/**
 * 净化渲染层上报的命中轮廓（主进程安全边界：不信任 IPC 载荷）。
 * 多边形/点数超限截断，非法点整条丢弃；无有效多边形返回 null（调用方回落矩形）。
 */
export function sanitizePetHitProxy(input: unknown): PetHitProxy | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.polygons)) return null;
  const polygons: PetHitPolygon[] = [];
  for (const raw of record.polygons.slice(0, PET_HIT_PROXY_MAX_POLYGONS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const polygon = raw as Record<string, unknown>;
    if (typeof polygon.id !== 'string' || !HIT_POLYGON_IDS.has(polygon.id)) continue;
    if (!Array.isArray(polygon.points)) continue;
    const rawPoints = polygon.points.slice(0, PET_HIT_PROXY_MAX_POINTS);
    if (rawPoints.length < 3) continue;
    const points: Array<[number, number]> = [];
    let valid = true;
    for (const point of rawPoints) {
      if (!Array.isArray(point) || point.length !== 2) {
        valid = false;
        break;
      }
      const [x, y] = point;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        valid = false;
        break;
      }
      points.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
    }
    if (valid) polygons.push({ id: polygon.id as PetHitPolygon['id'], points });
  }
  return polygons.length > 0 ? { version: 1, polygons } : null;
}
