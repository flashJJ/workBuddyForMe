/**
 * v0.3 多模态消息内容片段（持久化形态）。
 *
 * 设计约定：
 * - 纯文本老消息 content_parts 为 []，完全回落 Message.content，不做数据回填；
 * - 图片片段只持有 attachments.id，**绝不内联 base64 落库**；
 *   core 编排器在下发模型前才解析为 data URL；
 * - 片段顺序即展示/下发顺序，文本与图片可交错。
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image';
  attachmentId: string;
}

export type ContentPart = TextContentPart | ImageContentPart;
