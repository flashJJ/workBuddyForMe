'use client';

import * as React from 'react';
import { API } from '@/lib/api/endpoints';
import { withManagedHeaders } from '@/lib/api/client';
import type { StageBackground as Background } from '@wbfm/shared/schemas';
import { backgroundCss } from './builtin-backgrounds';

/** 图片背景：带托管令牌头 fetch → blob URL（同附件模式，不能直接 <img src>） */
function BackgroundImage({ fileRef, brightness, blur }: { fileRef: string; brightness: number; blur: number }) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let revoked = '';
    let cancelled = false;
    void fetch(API.stageBackground(fileRef), withManagedHeaders({})).then(async (res) => {
      if (!res.ok) return;
      const blob = await res.blob();
      if (cancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      revoked = objectUrl;
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [fileRef]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      style={{ filter: `brightness(${brightness}) blur(${blur}px)` }}
      data-testid="stage-bg-image"
    />
  );
}

/** 背景层：纯色/渐变/内置渐变/本地图片 + 亮度模糊 */
export function StageBackgroundLayer({ background }: { background: Background }) {
  const isImage = background.type === 'image' && background.fileRef;
  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="stage-background">
      <div
        className="absolute inset-0"
        style={{
          background: backgroundCss(background),
          // 图片类型时滤镜作用于 <img>；非图片类型作用于渐变层
          filter: isImage ? undefined : `brightness(${background.brightness}) blur(${background.blur}px)`,
        }}
      />
      {isImage && (
        <BackgroundImage
          fileRef={background.fileRef!}
          brightness={background.brightness}
          blur={background.blur}
        />
      )}
    </div>
  );
}
