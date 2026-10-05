import type { FlowNodeHandler } from '../types';

/**
 * end 节点：config.output 已由引擎在执行前做过引用解析。
 * 输出固定包一层 { output }：既满足「节点产出都是对象」的作用域约定，
 * 引擎也以 outputs.output 作为整个 Run 的最终结果；未声明时为 null。
 * type alias（非 interface）以兼容注册表的 Record 索引签名。
 */
export type EndNodeConfig = {
  output?: unknown;
};

export type EndNodeOutputs = {
  output: unknown;
};

export const endNodeHandler: FlowNodeHandler<EndNodeConfig, EndNodeOutputs> = {
  type: 'end',
  async run(config) {
    return { output: config.output === undefined ? null : config.output };
  },
};
