import { ApiError, type Assistant, type ContentPart } from '@wbfm/shared';
import type { AttachmentService } from '../services/attachment-service';
import type { ConversationService } from '../services/conversation-service';
import type { ResolvedChatTarget } from './model-resolver';
import type { StreamChatInput } from './types';
import { buildUserParts } from './multimodal';

export interface PreparedTurn {
  conversationId: string;
  userContent: string;
  userImageIds: string[];
}

function imageIdsOfParts(parts: ContentPart[]): string[] {
  return parts.filter((part): part is Extract<ContentPart, { type: 'image' }> =>
    part.type === 'image',
  ).map((part) => part.attachmentId);
}

/** 模型不支持视觉时给出可操作提示（设置中可切换视觉模型） */
function assertVisionCapable(model: ResolvedChatTarget['model'], imageCount: number): void {
  if (imageCount > 0 && !model.capabilities.includes('vision')) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `当前模型「${model.displayName}」不支持图片，请在设置中切换到视觉模型（如 qwen2.5-vl）`,
    );
  }
}

/**
 * 流式开始前的同步准备：解析会话/重生成状态、vision 门控与附件存在性校验，
 * 并落库本轮用户消息（含多模态片段）。任何失败都在 SSE 打开前抛出。
 */
export function prepareUserTurn(params: {
  assistant: Assistant;
  input: StreamChatInput;
  target: ResolvedChatTarget;
  conversations: ConversationService;
  attachments: AttachmentService;
}): PreparedTurn {
  const { assistant, input, target, conversations, attachments } = params;

  let conversationId: string;
  let userContent: string;
  let userImageIds: string[];

  if (input.regenerate) {
    if (!input.conversationId) throw ApiError.validation('重新生成需要已有会话');
    conversationId = input.conversationId;
    conversations.get(conversationId);
    const prepared = conversations.prepareRegenerate(conversationId);
    userContent = prepared.content;
    userImageIds = imageIdsOfParts(prepared.contentParts);
  } else {
    const conversation = input.conversationId
      ? conversations.get(input.conversationId)
      : conversations.create(assistant.id);
    conversationId = conversation.id;
    userContent = input.content;
    userImageIds = input.attachments ?? [];
    conversations.appendMessage({
      conversationId,
      role: 'user',
      content: userContent,
      contentParts: buildUserParts(userContent, userImageIds),
    });
  }

  assertVisionCapable(target.model, userImageIds.length);
  // 附件存在性在开流前校验，避免 meta 已推送后才失败
  attachments.requireRowsByIds(userImageIds);

  return { conversationId, userContent, userImageIds };
}
