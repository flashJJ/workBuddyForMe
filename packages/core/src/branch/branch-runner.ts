import type { StreamChatInput, OrchestratorEvent } from '../chat/base/types';
import type { TokenUsage } from '@wbfm/shared/api';

/** v2.21 M2：把编排器事件收敛为分支终态；父会话不插入回传消息。 */

export type BranchRunStatus = 'succeeded' | 'failed' | 'cancelled';

export interface BranchRunResult {
  status: BranchRunStatus;
  content: string;
  usage: TokenUsage | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type BranchChatRunner = (
  input: StreamChatInput,
) => AsyncGenerator<OrchestratorEvent>;

export async function runBranchChat(
  runner: BranchChatRunner,
  input: Omit<StreamChatInput, 'signal'>,
  signal: AbortSignal,
): Promise<BranchRunResult> {
  let content = '';
  let usage: TokenUsage | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    for await (const event of runner({ ...input, signal })) {
      if (event.event === 'delta') {
        content += event.data.content;
        continue;
      }
      if (event.event === 'done') {
        content = event.data.content || content;
        usage = event.data.usage ?? null;
        continue;
      }
      if (event.event === 'error') {
        errorCode = event.data.code;
        errorMessage = event.data.message;
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    errorCode = errorCode ?? 'BRANCH_RUN_FAILED';
  }

  if (signal.aborted) {
    return { status: 'cancelled', content, usage, errorCode: null, errorMessage: null };
  }
  if (errorMessage) {
    return { status: 'failed', content, usage, errorCode, errorMessage };
  }
  return { status: 'succeeded', content, usage, errorCode: null, errorMessage: null };
}
