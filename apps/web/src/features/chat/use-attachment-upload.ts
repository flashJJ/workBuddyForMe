'use client';

import * as React from 'react';
import type { Attachment } from '@wbfm/shared';
import { MAX_CHAT_ATTACHMENTS } from '@wbfm/shared';
import { API } from '@/lib/api/endpoints';
import { apiUpload } from '@/lib/api/client';
import { compressImage, isSupportedImage } from '@/lib/utils/image';

export interface PendingAttachment {
  attachmentId: string;
  previewUrl: string;
}

interface UseAttachmentUploadOptions {
  onError: (message: string) => void;
}

/**
 * 聊天图片待发队列：压缩 → POST /api/attachments → 持 ID 入队。
 * 发送成功后由 reset 清空；对象 URL 在移除/卸载时回收，避免内存泄漏。
 */
export function useAttachmentUpload({ onError }: UseAttachmentUploadOptions) {
  const [items, setItems] = React.useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const itemsRef = React.useRef<PendingAttachment[]>([]);
  itemsRef.current = items;

  const revoke = React.useCallback((item: PendingAttachment) => {
    URL.revokeObjectURL(item.previewUrl);
  }, []);

  const remove = React.useCallback(
    (attachmentId: string) => {
      setItems((prev) => {
        const target = prev.find((item) => item.attachmentId === attachmentId);
        if (target) revoke(target);
        return prev.filter((item) => item.attachmentId !== attachmentId);
      });
    },
    [revoke],
  );

  const reset = React.useCallback(() => {
    itemsRef.current.forEach(revoke);
    setItems([]);
  }, [revoke]);

  const addFiles = React.useCallback(
    async (files: File[]) => {
      const candidates = files.filter(isSupportedImage);
      if (candidates.length < files.length) {
        onError('仅支持 PNG / JPEG / WebP 图片');
      }
      const room = MAX_CHAT_ATTACHMENTS - itemsRef.current.length;
      if (room <= 0) {
        onError(`最多附加 ${MAX_CHAT_ATTACHMENTS} 张图片`);
        return;
      }
      const accepted = candidates.slice(0, room);
      if (accepted.length < candidates.length) {
        onError(`最多附加 ${MAX_CHAT_ATTACHMENTS} 张图片，已忽略超出部分`);
      }
      if (accepted.length === 0) return;

      setUploading(true);
      try {
        for (const file of accepted) {
          // 逐张压缩上传：失败一张不影响其余图片，错误即时提示
          const compressed = await compressImage(file);
          const form = new FormData();
          form.append('file', compressed.blob, compressed.filename);
          const attachment = await apiUpload<Attachment>(API.attachments, form);
          const previewUrl = URL.createObjectURL(compressed.blob);
          setItems((prev) =>
            prev.some((item) => item.attachmentId === attachment.id)
              ? prev
              : [...prev, { attachmentId: attachment.id, previewUrl }],
          );
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : '图片上传失败');
      } finally {
        setUploading(false);
      }
    },
    [onError],
  );

  React.useEffect(() => () => itemsRef.current.forEach(revoke), [revoke]);

  return { items, uploading, addFiles, remove, reset };
}
