/**
 * v3.0 剧本引擎：Cue 契约（M0）。
 *
 * Cue 是最小表现单元，只描述「要什么」，不持有状态、不直接写骨骼/音频；
 * 由 Director 调度、轨道适配器执行。M0 冻结 9 类 cue；
 * sound / effect / move / emit 仅保留类型，运行时忽略并 warn（见 09 文档 §4.2）。
 */

import { z } from 'zod';
import { EXPRESSION_TAGS, type ExpressionTag } from '../emotion/expression';
import { PET_LINE_POOLS, type PetLinePoolId } from '../interaction/pet-lines';
import { conditionSchema, type Condition } from './conditions';

/** 程序化手势（仅 VRM；Live2D 静默忽略） */
export const SCRIPT_GESTURES = ['nod', 'tilt', 'glanceLeft', 'glanceRight'] as const;
export type ScriptGesture = (typeof SCRIPT_GESTURES)[number];

/** 视线目标（双栈） */
export const SCRIPT_LOOK_TARGETS = ['camera', 'pointer', 'away', 'up', 'down'] as const;
export type ScriptLookTarget = (typeof SCRIPT_LOOK_TARGETS)[number];

/** M0 只保留类型、运行时忽略的 cue（保留给 M1 的表现层扩展） */
export const M0_IGNORED_CUE_KINDS = ['sound', 'effect', 'move', 'emit'] as const;
export type M0IgnoredCueKind = (typeof M0_IGNORED_CUE_KINDS)[number];

const fadeMsSchema = z.number().int().min(0).max(5000).optional();
const holdMsSchema = z.number().int().min(0).max(60_000).optional();
const idSchema = z.string().trim().min(1).max(160);
const poolSchema = z.enum(Object.keys(PET_LINE_POOLS) as [PetLinePoolId, ...PetLinePoolId[]]);

export interface PoseCue {
  kind: 'pose';
  /** Preset id（见 presets.ts） */
  preset: string;
  fadeMs?: number;
}
export interface GestureCue {
  kind: 'gesture';
  gesture: ScriptGesture;
  /** 0..1，缺省 1 */
  intensity?: number;
}
export interface MotionCue {
  kind: 'motion';
  /** 动作 id（内置或 motion:<fileRef>） */
  motion: string;
  loop?: boolean;
  fadeMs?: number;
}
export interface ExpressionCue {
  kind: 'expression';
  tag: ExpressionTag;
  holdMs?: number;
}
export interface LookCue {
  kind: 'look';
  target: ScriptLookTarget;
  /** 0..1，缺省 1 */
  weight?: number;
  holdMs?: number;
}
export interface LineCue {
  kind: 'line';
  /** 台词池 id（词条仍在 i18n） */
  pool: PetLinePoolId;
  /** 字幕留存毫秒 */
  ms?: number;
}
export interface SpeakCue {
  kind: 'speak';
  /** 指定文案（与 pool 二选一） */
  text?: string;
  pool?: PetLinePoolId;
  /** 是否经主窗 TTS 队列发声，缺省 true */
  tts?: boolean;
}
export interface WaitCue {
  kind: 'wait';
  ms: number;
}
export interface BranchCue {
  kind: 'branch';
  if: Condition;
  then: Cue[];
  else?: Cue[];
}
export interface SoundCue {
  kind: 'sound';
  sound: string;
  volume?: number;
}
export interface EffectCue {
  kind: 'effect';
  effect: string;
  params?: Record<string, number>;
}
export interface MoveCue {
  kind: 'move';
  target: 'random' | 'center' | 'away-from-pointer';
  durationMs?: number;
}
export interface EmitCue {
  kind: 'emit';
  event: string;
  payload?: Record<string, string | number | boolean>;
}

export type Cue =
  | PoseCue
  | GestureCue
  | MotionCue
  | ExpressionCue
  | LookCue
  | LineCue
  | SpeakCue
  | WaitCue
  | BranchCue
  | SoundCue
  | EffectCue
  | MoveCue
  | EmitCue;

const speakCueSchema = z.object({
  kind: z.literal('speak'),
  text: z.string().min(1).max(200).optional(),
  pool: poolSchema.optional(),
  tts: z.boolean().optional(),
});

const branchCueSchema = z.object({
  kind: z.literal('branch'),
  if: conditionSchema,
  then: z.lazy(() => z.array(cueSchema)),
  else: z.lazy(() => z.array(cueSchema)).optional(),
});

/** Cue zod 校验（branch 递归；未知 kind 与非法参数均带路径拒绝） */
export const cueSchema: z.ZodType<Cue> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pose'), preset: idSchema, fadeMs: fadeMsSchema }),
    z.object({
      kind: z.literal('gesture'),
      gesture: z.enum(SCRIPT_GESTURES),
      intensity: z.number().min(0).max(1).optional(),
    }),
    z.object({
      kind: z.literal('motion'),
      motion: idSchema,
      loop: z.boolean().optional(),
      fadeMs: fadeMsSchema,
    }),
    z.object({
      kind: z.literal('expression'),
      tag: z.enum(EXPRESSION_TAGS),
      holdMs: holdMsSchema,
    }),
    z.object({
      kind: z.literal('look'),
      target: z.enum(SCRIPT_LOOK_TARGETS),
      weight: z.number().min(0).max(1).optional(),
      holdMs: holdMsSchema,
    }),
    z.object({
      kind: z.literal('line'),
      pool: poolSchema,
      ms: z.number().int().min(0).max(60_000).optional(),
    }),
    speakCueSchema,
    z.object({ kind: z.literal('wait'), ms: z.number().int().min(0).max(600_000) }),
    branchCueSchema,
    z.object({
      kind: z.literal('sound'),
      sound: idSchema,
      volume: z.number().min(0).max(1).optional(),
    }),
    z.object({
      kind: z.literal('effect'),
      effect: idSchema,
      params: z.record(z.number()).optional(),
    }),
    z.object({
      kind: z.literal('move'),
      target: z.enum(['random', 'center', 'away-from-pointer']),
      durationMs: z.number().int().min(0).max(60_000).optional(),
    }),
    z.object({
      kind: z.literal('emit'),
      event: idSchema,
      payload: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  ]),
);

/** M0 运行时是否忽略该 cue（忽略时记一条 warn，不中断整场） */
export function isM0IgnoredCue(cue: Cue): boolean {
  return (M0_IGNORED_CUE_KINDS as readonly string[]).includes(cue.kind);
}
