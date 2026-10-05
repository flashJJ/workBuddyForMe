import type { FlowNodeHandler } from '../types';

/**
 * start 节点：输出 { params }，params 为运行时实际入参。
 * 入参字段声明（config.inputs）在 M1 接 API 层做校验，M0 引擎透传。
 * type alias（非 interface）以兼容注册表的 Record 索引签名。
 */
export type StartNodeOutputs = {
  params: Record<string, unknown>;
};

export const startNodeHandler: FlowNodeHandler<Record<string, unknown>, StartNodeOutputs> = {
  type: 'start',
  async run(_config, ctx) {
    return { params: ctx.input };
  },
};
