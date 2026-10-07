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
import { DEFAULT_AVATAR_MODEL_ID, SUPPORTED_AVATAR_MODEL_IDS } from './schemas/voice';
import { EXPRESSION_TAGS, type ExpressionTag } from './schemas/expression';

/** 桌宠表现状态机（与语音状态机取值对齐） */
export type PetVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * 主窗 → 桌宠的表现事件（经主进程 pet-manager 单窗转发）。
 * - level：TTS 播放电平 0~1，仅播放期由音频线程回调驱动（约 30Hz），idle 不发；
 * - subtitle：当前朗读句（已剥表情标签、调用方限长）；
 * - expression：8 个规范表情标签之一；
 * - conversation：切换会话/重置，桌宠清空字幕与表情。
 */
export type PetPerformanceEvent =
  | { kind: 'level'; value: number }
  | { kind: 'state'; state: PetVoiceState }
  | { kind: 'subtitle'; text: string }
  | { kind: 'expression'; tag: string }
  | { kind: 'conversation' };

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
  /** 桌宠窗：双击回主窗（主窗显示并聚焦） */
  focusMain(): void;
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
  /** 主窗：中继语音表现事件（单窗转发；桌宠未开时主进程直接丢弃） */
  relayPerformance(event: PetPerformanceEvent): void;
  /** 桌宠窗：订阅表现事件，返回取消订阅 */
  onPerformance(cb: (event: PetPerformanceEvent) => void): () => void;
  /** 主窗：订阅桌宠开关状态（用于主窗形象栏让位），返回取消订阅 */
  onOpenChange(cb: (open: boolean) => void): () => void;
}

/** 模型 id 白名单归一：未知/空值回落默认 haru（与 web 端 getAvatarModel 同语义） */
export function normalizeAvatarModelId(id: unknown): string {
  return typeof id === 'string' &&
    (SUPPORTED_AVATAR_MODEL_IDS as readonly string[]).includes(id)
    ? id
    : DEFAULT_AVATAR_MODEL_ID;
}

const PET_VOICE_STATES = ['idle', 'listening', 'thinking', 'speaking'] as const;
/** 中继字幕限长（调用方也会限；主进程兜底防异常长文本刷 IPC） */
export const PET_SUBTITLE_MAX = 120;
const TAG_SET = new Set<string>(EXPRESSION_TAGS);

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
    default:
      return null;
  }
}
