import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '@wbfm/shared';
import {
  createConversationRepository,
  createMessageRepository,
  createAttachmentRepository,
  createAssistantRepository,
} from '@wbfm/database';
import { getDataRoot } from '@wbfm/config';
import type { ServiceDeps } from '../services/deps';
import { getAppVersion } from '../backup/app-version';
import {
  sanitizeSnapshot,
  type ConversationSnapshot,
  type SharedMessage,
  type SharedPart,
} from './snapshot';

/** 导出时消息上限（分享单会话，足够大；与备份导出 500 对齐） */
const EXPORT_MESSAGE_LIMIT = 1000;

/**
 * 构建对话分享快照：
 * 拉会话 + 全部消息 → contentParts 中的图片附件转 data URL → 脱敏。
 * 不落库、不写临时文件，输出纯内存结构供 markdown/html 序列化。
 */
export function buildConversationSnapshot(
  deps: ServiceDeps,
  conversationId: string,
): ConversationSnapshot {
  const convRepo = createConversationRepository(deps.db);
  const msgRepo = createMessageRepository(deps.db);
  const attRepo = createAttachmentRepository(deps.db);
  const assistantRepo = createAssistantRepository(deps.db);

  const conversation = convRepo.findById(conversationId);
  if (!conversation) throw ApiError.notFound('会话', conversationId);

  const assistant = assistantRepo.findById(conversation.assistantId);

  // error 状态消息不进分享（流式失败残留，对读者无意义）
  const messages = msgRepo
    .listByConversation(conversationId, EXPORT_MESSAGE_LIMIT)
    .filter((m) => m.status !== 'error');

  // 收集全部图片附件 id，一次性批量取行
  const imageIds = new Set<string>();
  for (const m of messages) {
    for (const part of m.contentParts) {
      if (part.type === 'image') imageIds.add(part.attachmentId);
    }
  }
  const attRows = attRepo.listRowsByIds([...imageIds]);
  const dataUrlById = new Map<string, string>();
  const attDir = path.join(getDataRoot(), 'attachments');
  for (const row of attRows) {
    const filePath = path.join(attDir, row.storage_path);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      dataUrlById.set(row.id, `data:${row.mime_type};base64,${buf.toString('base64')}`);
    }
  }

  const sharedMessages: SharedMessage[] = messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    createdAt: m.createdAt,
    parts: resolveParts(m.contentParts, dataUrlById),
    toolTrace: m.toolTrace,
    citations: m.citations,
  }));

  const raw: ConversationSnapshot = {
    conversationId: conversation.id,
    title: conversation.title,
    assistantName: assistant?.name ?? null,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    messages: sharedMessages,
  };

  return sanitizeSnapshot(raw, getDataRoot());
}

/** contentParts 落库形态 → 分享形态（图片 id 替换为 data URL；附件丢失时跳过） */
function resolveParts(
  parts: Array<{ type: string; text?: string; attachmentId?: string }>,
  dataUrlById: Map<string, string>,
): SharedPart[] {
  const out: SharedPart[] = [];
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      out.push({ type: 'text', text: part.text });
    } else if (part.type === 'image' && part.attachmentId) {
      const dataUrl = dataUrlById.get(part.attachmentId);
      if (dataUrl) out.push({ type: 'image', dataUrl });
    }
  }
  return out;
}
