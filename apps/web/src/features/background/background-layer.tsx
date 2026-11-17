'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { BackgroundView } from './hooks/use-background';

interface BackgroundLayerProps {
  view: BackgroundView;
  className?: string;
  testId?: string;
}

/**
 * v4.4 M4：背景渲染层。
 * - 视频静音循环；页面不可见或减少动态效果时暂停并停在当前帧；
 * - dim 为黑色遮罩，blur 只作用于背景层，不影响角色画布与 UI。
 */
export function BackgroundLayer({ view, className, testId }: BackgroundLayerProps) {
  const { resolved, fit, dim, blur } = view;
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const retryRef = React.useRef(0);
  const retryTimerRef = React.useRef<number | null>(null);
  const kind = resolved.kind;
  const videoUrl = resolved.kind === 'video' ? resolved.url : '';

  // 换源时重置重试计数；卸载时清理定时器
  React.useEffect(() => {
    retryRef.current = 0;
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [videoUrl]);

  /**
   * v4.4：视频加载失败（服务未就绪/慢加载）时按 1s/2s/4s 重试 3 次。
   * 重试期间保留 poster 首帧，避免出现“没有壁纸”的白底。
   */
  const handleVideoError = () => {
    const video = videoRef.current;
    if (!video || retryRef.current >= 3) return;
    const delay = 1000 * 2 ** retryRef.current;
    retryRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      video.load();
    }, delay);
  };

  React.useEffect(() => {
    if (kind !== 'video') return;
    const video = videoRef.current;
    if (!video) return;
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const apply = () => {
      if ((media?.matches ?? false) || document.visibilityState !== 'visible') {
        video.pause();
        return;
      }
      try {
        const played = video.play();
        if (played && typeof played.catch === 'function') played.catch(() => undefined);
      } catch {
        // jsdom 等不支持媒体播放的环境：静默忽略
      }
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    media?.addEventListener('change', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      media?.removeEventListener('change', apply);
    };
  }, [kind, videoUrl]);

  if (kind === 'none') return null;

  return (
    <div
      className={cn('pointer-events-none overflow-hidden', className ?? 'absolute inset-0')}
      data-testid={testId ?? 'background-layer'}
      data-background-kind={kind}
      aria-hidden="true"
      style={blur > 0 ? { filter: `blur(${blur}px)` } : undefined}
    >
      {kind === 'gradient' && (
        <div className="h-full w-full" style={{ background: resolved.gradient }} />
      )}
      {kind === 'image' && (
        <img
          src={resolved.url}
          alt=""
          className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
        />
      )}
      {kind === 'video' && (
        <video
          ref={videoRef}
          src={resolved.url}
          poster={resolved.poster}
          className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onError={handleVideoError}
        />
      )}
      {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}
