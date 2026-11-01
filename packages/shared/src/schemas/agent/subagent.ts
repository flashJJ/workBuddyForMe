import { z } from 'zod';

/**
 * v2.11 外部代理（本地 CLI）契约：
 * - 默认关；启用并配置命令后才注册提供方；
 * - 每次运行先审批（fail-closed），`cwd` 必须由用户显式填写；
 * - 运行证据落 `subagent_runs` + WorkSignal + session_events。
 */

export const SUBAGENT_CLI_PROVIDER_ID = 'local-cli';
export const SUBAGENT_CLI_PROTOCOL_VERSION = 1;

export const SUBAGENT_CLI_ARGS_MAX = 10;
export const SUBAGENT_CLI_ARG_MAX = 200;

export const SUBAGENT_CLI_TIMEOUT_MIN_MS = 60_000;
export const SUBAGENT_CLI_TIMEOUT_MAX_MS = 1_800_000;
export const SUBAGENT_CLI_TIMEOUT_DEFAULT_MS = 600_000;

export const SUBAGENT_CLI_OUTPUT_MIN_BYTES = 65_536;
export const SUBAGENT_CLI_OUTPUT_MAX_BYTES = 8_388_608;
export const SUBAGENT_CLI_OUTPUT_DEFAULT_BYTES = 2_097_152;

export const SUBAGENT_RUN_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
  'budget_exceeded',
] as const;
export type SubagentRunStatus = (typeof SUBAGENT_RUN_STATUSES)[number];

/** 运行记录（API / 证据 / 回投共用视图） */
export interface SubagentRunView {
  id: string;
  providerId: string;
  goal: string;
  cwd: string;
  conversationId: string | null;
  status: SubagentRunStatus;
  summary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  outputBytes: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface SubagentProviderInfo {
  id: string;
  label: string;
  available: boolean;
}

export const subagentRunInputSchema = z.object({
  goal: z.string().trim().min(1).max(500),
  cwd: z.string().trim().min(1).max(500),
  conversationId: z.string().trim().min(1).max(80).optional(),
  budget: z
    .object({
      maxRounds: z.number().int().min(1).max(20).optional(),
      maxTotalTokens: z.number().int().min(1_000).max(2_000_000).optional(),
    })
    .optional(),
});
export type SubagentRunInput = z.infer<typeof subagentRunInputSchema>;

export const subagentRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
