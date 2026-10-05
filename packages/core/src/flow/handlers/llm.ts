import type { TokenUsage } from '@wbfm/ai';
import type { FlowNodeHandler } from '../types';

/**
 * llm 节点：一次性（非逐 token）调用对话模型，累积完整文本。
 * 模型由 config.modelId 指定，缺省由运行环境解析全局默认对话模型。
 * 可选 system/user 模板（引擎执行前已完成引用插值）。
 */
export type LlmNodeConfig = {
  modelId?: string | null;
  system?: string;
  user: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

export interface LlmNodeOutputs {
  text: string;
  tokens?: TokenUsage;
}

export const llmNodeHandler: FlowNodeHandler<LlmNodeConfig, LlmNodeOutputs> = {
  type: 'llm',
  async run(config, ctx) {
    if (!ctx.resolveChatTarget) {
      throw new Error('当前运行环境未配置模型能力（llm 节点不可用）');
    }
    const user = typeof config.user === 'string' ? config.user : String(config.user ?? '');
    if (!user.trim()) throw new Error('llm 节点的 user 提示词不能为空');

    const { provider, model } = await ctx.resolveChatTarget({ modelId: config.modelId ?? null });
    const messages = [
      ...(config.system?.trim()
        ? [{ role: 'system' as const, content: config.system }]
        : []),
      { role: 'user' as const, content: user },
    ];

    let text = '';
    let usage: TokenUsage | undefined;
    for await (const chunk of provider.chatStream({
      model: model.modelId,
      messages,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.topP !== undefined ? { topP: config.topP } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      signal: ctx.signal,
    })) {
      text += chunk.delta;
      if (chunk.usage) usage = chunk.usage;
    }
    return { text: text.trim(), ...(usage ? { tokens: usage } : {}) };
  },
};
