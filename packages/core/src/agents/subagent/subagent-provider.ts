/**
 * v2.10 外部代理缝（默认关）：
 * - 提供方注册后才可用；无实现时核心功能不受影响；
 * - 统一预算/审批/证据回传由调用方在接入时实现，本期只提供注册表。
 */

export interface SubagentProviderInput {
  goal: string;
  conversationId?: string;
  /** 预算上限（token/轮次由提供方解释） */
  budget?: { maxRounds?: number; maxTotalTokens?: number };
  /** v2.11：显式工作目录（宿主已校验存在/非系统/非数据目录） */
  cwd?: string;
  /** v2.11：子进程 permission 帧的宿主审批回调；缺省一律拒绝（fail-closed） */
  requestPermission?: (
    request: { id: string; title: string; detail?: string },
    signal: AbortSignal,
  ) => Promise<boolean>;
}

export interface SubagentProviderResult {
  status: 'done' | 'failed' | 'cancelled';
  summary: string;
  error?: string;
  /** v2.11：机器可读失败码（timeout / output_limit / protocol / spawn_error…） */
  errorCode?: string;
  /** v2.11：stdout 原始字节数（运行证据） */
  outputBytes?: number;
}

export interface SubagentProvider {
  id: string;
  label: string;
  /** 外部依赖是否就绪（缺命令/未授权时返回 false，不阻断启动） */
  available(): boolean;
  run(input: SubagentProviderInput, signal?: AbortSignal): Promise<SubagentProviderResult>;
}

export interface SubagentProviderRegistry {
  register(provider: SubagentProvider): () => void;
  list(): Array<{ id: string; label: string; available: boolean }>;
  get(id: string): SubagentProvider | null;
}

export function createSubagentProviderRegistry(): SubagentProviderRegistry {
  const providers = new Map<string, SubagentProvider>();
  return {
    register(provider) {
      if (providers.has(provider.id)) {
        throw new Error(`子代理提供方已注册：${provider.id}`);
      }
      providers.set(provider.id, provider);
      return () => providers.delete(provider.id);
    },
    list() {
      return [...providers.values()].map((provider) => ({
        id: provider.id,
        label: provider.label,
        available: provider.available(),
      }));
    },
    get(id) {
      return providers.get(id) ?? null;
    },
  };
}
