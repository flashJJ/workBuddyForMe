import type { ContentPart, Message } from '@wbfm/shared';
import type { ChatContentPart } from '@wbfm/ai';
import type { AttachmentService, ResolvedImage } from '../services/attachment-service';

/** data URL 前缀（视觉模型 wire 形态） */
export function toImageDataUrl(image: ResolvedImage): string {
  return `data:${image.mimeType};base64,${image.dataBase64}`;
}

/** 收集一批历史消息中出现的全部图片附件 ID（去重、保持首次出现顺序） */
export function collectImageIds(messages: Message[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.contentParts) {
      if (part.type === 'image' && !ids.includes(part.attachmentId)) ids.push(part.attachmentId);
    }
  }
  return ids;
}

/**
 * 落库消息 → 模型 wire content。
 * contentParts 为空（v0.2 及更早的纯文本消息）时原样回落字符串；
 * 图片片段引用的附件缺失视为服务端数据损坏，直接抛错而非静默丢图。
 */
export function toAiContent(
  message: Message,
  images: Map<string, ResolvedImage>,
): string | ChatContentPart[] {
  if (message.contentParts.length === 0) return message.content;
  return message.contentParts.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const image = images.get(part.attachmentId);
    if (!image) throw new Error(`图片附件数据缺失：${part.attachmentId}`);
    return { type: 'image_url', image_url: { url: toImageDataUrl(image), detail: 'auto' } };
  });
}

/** 本轮用户输入 → 持久化片段；纯图片消息没有 text 片段 */
export function buildUserParts(text: string, attachmentIds: string[]): ContentPart[] {
  const parts: ContentPart[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const attachmentId of attachmentIds) parts.push({ type: 'image', attachmentId });
  return parts;
}

/** 批量读取历史消息中的图片，构造 attachmentId → data 映射供 wire 组装 */
export function buildImageMap(
  attachments: Pick<AttachmentService, 'loadImages'>,
  messages: Message[],
): Map<string, ResolvedImage> {
  return new Map(
    attachments
      .loadImages(collectImageIds(messages))
      .map((image) => [image.attachmentId, image]),
  );
}
