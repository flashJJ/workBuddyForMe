/**
 * v2.21：分支回传证据生成。
 * 产物从子会话消息的 toolTrace.artifacts 提取；按 attachmentId 去重，不读文件系统。
 */
import type {
  BranchArtifactRef,
  BranchEvidence,
  ConversationBranch,
  Message,
} from '@wbfm/shared/types';
import type { BranchRunResult } from './branch-runner';

export type MessageTraceReader = {
  listByConversation(conversationId: string, limit?: number): Message[];
};

/** 从子会话最近消息里收集产物；同一 attachment 只保留一次 */
export function collectBranchArtifacts(
  messages: MessageTraceReader,
  childConversationId: string,
): BranchArtifactRef[] {
  const seen = new Set<string>();
  const artifacts: BranchArtifactRef[] = [];
  for (const message of messages.listByConversation(childConversationId, 200)) {
    for (const entry of message.toolTrace ?? []) {
      for (const artifact of entry.artifacts ?? []) {
        if (seen.has(artifact.attachmentId)) continue;
        seen.add(artifact.attachmentId);
        artifacts.push({
          id: artifact.attachmentId,
          title: artifact.title,
          kind: artifact.format,
        });
      }
    }
  }
  return artifacts;
}

export function buildBranchEvidence(
  branch: ConversationBranch,
  result: BranchRunResult,
  artifacts: BranchArtifactRef[],
): BranchEvidence {
  return {
    branchId: branch.id,
    parentConversationId: branch.parentConversationId,
    childConversationId: branch.childConversationId,
    rootConversationId: branch.rootConversationId,
    status: result.status,
    summary: result.content.slice(0, 4000),
    artifacts,
    usage: result.usage
      ? {
          promptTokens: result.usage.promptTokens ?? 0,
          completionTokens: result.usage.completionTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        }
      : null,
    needsReview: true,
    createdAt: new Date().toISOString(),
  };
}
