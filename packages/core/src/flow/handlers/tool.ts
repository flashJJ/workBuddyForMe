import type { FlowNodeHandler } from '../types';

/**
 * tool 节点：执行一个内置/MCP/flow 工具。
 * 工具解析与 write/danger 授权门控由引擎在调用前统一完成，
 * 本处理器只负责把解析后的参数交给工具内核（含 15s 超时与异常归一）。
 */
export type ToolNodeConfig = {
  /** 工具限定名（内置名 / mcp:<server>:<tool> / flow:<id>） */
  toolName: string;
  /** 已完成引用解析的工具参数 */
  args?: Record<string, unknown>;
};

export type ToolNodeOutputs = {
  ok: boolean;
  output: string;
  summary: string;
  citations?: unknown[];
  images?: unknown[];
};

export const toolNodeHandler: FlowNodeHandler<ToolNodeConfig, ToolNodeOutputs> = {
  type: 'tool',
  async run(config, ctx) {
    const tool = ctx.activeTool;
    if (!tool) throw new Error('工具尚未解析（引擎未注入 activeTool）');
    if (!ctx.executeTool) throw new Error('当前运行环境未配置工具执行能力');
    const result = await ctx.executeTool(tool, config.args ?? {});
    return {
      ok: result.ok,
      output: result.output,
      summary: result.summary,
      ...(result.citations ? { citations: result.citations } : {}),
      ...(result.images ? { images: result.images } : {}),
    };
  },
};
