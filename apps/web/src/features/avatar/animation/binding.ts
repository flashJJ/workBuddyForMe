/**
 * M0d T2.1：语义 → morph 的 binding 契约与加载器。
 *
 * binding 是项目自己的映射表，不属于 VRM；内容只写语义通道，
 * 由这里解析成模型 morph target 索引，运行时再写 morphTargetInfluences。
 */

import { z } from 'zod';

const morphTargetSchema = z
  .object({
    index: z.number().int().min(0),
    name: z.string().min(1),
    /** 通道叠加权重，缺省 1 */
    scale: z.number().positive().optional(),
    /** VRM 标准表情绑定权重，缺省 1 */
    weight: z.number().min(0).max(1).optional(),
  })
  .strict();

const targetNameSchema = z
  .object({ index: z.number().int().min(0), name: z.string().min(1) })
  .strict();

export const morphBindingSchema = z
  .object({
    schema: z.literal(1),
    family: z.string().min(1),
    engine: z.enum(['vrm0', 'vrm1']),
    mesh: z.string().min(1),
    morphCount: z.number().int().positive(),
    sourceBaseline: z.string().min(1).optional(),
    targets: z.array(targetNameSchema),
    standardExpressions: z.record(z.array(morphTargetSchema)),
    channels: z.record(z.array(morphTargetSchema)),
    reservedChannels: z.array(z.string().min(1)),
    notes: z.array(z.string()).optional(),
  })
  .strict();

export type MorphBindingDefinition = z.infer<typeof morphBindingSchema>;
export type MorphBindingTarget = z.infer<typeof morphTargetSchema>;

export class MorphBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MorphBindingError';
  }
}

export interface MorphBindingIndex {
  readonly definition: MorphBindingDefinition;
  readonly nameToIndex: ReadonlyMap<string, number>;
  /** 语义通道 → 目标列表；未知通道返回 null，不分配 */
  resolve(channel: string): readonly MorphBindingTarget[] | null;
  /** blink / viseme 等保留通道，行为轨道不得写入 */
  isReserved(channel: string): boolean;
}

function validateReferences(definition: MorphBindingDefinition): void {
  if (definition.targets.length !== definition.morphCount) {
    throw new MorphBindingError(
      `targets 数量 ${definition.targets.length} 与 morphCount ${definition.morphCount} 不一致`,
    );
  }
  const indices = new Set<number>();
  const names = new Set<string>();
  for (const target of definition.targets) {
    if (target.index >= definition.morphCount) {
      throw new MorphBindingError(`target 索引越界: ${target.index}`);
    }
    if (indices.has(target.index)) {
      throw new MorphBindingError(`target 索引重复: ${target.index}`);
    }
    if (names.has(target.name)) {
      throw new MorphBindingError(`target 名称重复: ${target.name}`);
    }
    indices.add(target.index);
    names.add(target.name);
  }
  const reserved = new Set(definition.reservedChannels);
  if (reserved.size !== definition.reservedChannels.length) {
    throw new MorphBindingError('reservedChannels 存在重复项');
  }

  const checkTargets = (channel: string, targets: readonly MorphBindingTarget[], allowEmpty: boolean) => {
    if (!allowEmpty && targets.length === 0) {
      throw new MorphBindingError(`通道 ${channel} 没有目标`);
    }
    for (const target of targets) {
      if (target.index >= definition.morphCount) {
        throw new MorphBindingError(`通道 ${channel} 索引越界: ${target.index}`);
      }
      const expected = definition.targets[target.index];
      if (!expected || expected.name !== target.name) {
        throw new MorphBindingError(
          `通道 ${channel} 名称不匹配: ${target.index} 应为 ${expected?.name ?? '未知'}`,
        );
      }
    }
  };

  for (const [name, targets] of Object.entries(definition.standardExpressions)) {
    checkTargets(`standard.${name}`, targets, true);
  }
  for (const [channel, targets] of Object.entries(definition.channels)) {
    for (const prefix of definition.reservedChannels) {
      if (channel === prefix || channel.startsWith(`${prefix}.`)) {
        throw new MorphBindingError(`通道 ${channel} 使用了保留前缀 ${prefix}`);
      }
    }
    checkTargets(channel, targets, false);
  }
}

/** 校验并建立 O(1) 查询索引；失败抛 MorphBindingError */
export function buildMorphBinding(input: unknown): MorphBindingIndex {
  const parsed = morphBindingSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new MorphBindingError(`binding 结构非法: ${detail}`);
  }
  const definition = parsed.data;
  validateReferences(definition);

  const channels = new Map(Object.entries(definition.channels));
  const nameToIndex = new Map(definition.targets.map((target) => [target.name, target.index]));
  return {
    definition,
    nameToIndex,
    resolve(channel: string) {
      return channels.get(channel) ?? null;
    },
    isReserved(channel: string) {
      return definition.reservedChannels.some(
        (prefix) => channel === prefix || channel.startsWith(`${prefix}.`),
      );
    },
  };
}
