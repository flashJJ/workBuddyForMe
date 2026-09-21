'use client';

import * as React from 'react';
import { API } from '@/lib/api/endpoints';
import { withManagedHeaders } from '@/lib/api/client';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

/** 会话级 blob URL 缓存：消息频繁重渲染/重新拉取时避免重复下载同一图片 */
const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function fetchObjectUrl(attachmentId: string): Promise<string> {
  const cached = urlCache.get(attachmentId);
  if (cached) return cached;
  const pending = inflight.get(attachmentId);
  if (pending) return pending;

  const promise = fetch(API.attachment(attachmentId), withManagedHeaders())
    .then(async (response) => {
      if (!response.ok) throw new Error('图片加载失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      urlCache.set(attachmentId, url);
      inflight.delete(attachmentId);
      return url;
    })
    .catch((error) => {
      inflight.delete(attachmentId);
      throw error;
    });
  inflight.set(attachmentId, promise);
  return promise;
}

/** 消息内图片：缩略图 + 点击 lightbox 放大；数据经带令牌头的 fetch 取 blob */
export function AttachmentImage({ attachmentId }: { attachmentId: string }) {
  const [url, setUrl] = React.useState<string | null>(() => urlCache.get(attachmentId) ?? null);
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setFailed(false);
    fetchObjectUrl(attachmentId)
      .then((resolved) => {
        if (active) setUrl(resolved);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attachmentId]);

  if (failed) {
    return (
      <span className="inline-block rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
        图片不可用
      </span>
    );
  }
  if (!url) {
    return <span className="inline-block h-16 w-16 animate-pulse rounded-md bg-muted" aria-label="图片加载中" />;
  }

  return (
    <>
      <button
        type="button"
        className="block"
        aria-label="查看大图"
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="聊天图片"
          className="max-h-48 max-w-xs rounded-md border object-contain hover:opacity-90"
          data-testid="message-image"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">图片预览</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="聊天图片大图" className="max-h-[80vh] w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
