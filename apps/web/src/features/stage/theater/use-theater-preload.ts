'use client';

import * as React from 'react';
import { resolveBuiltinVrmAsset } from '@wbfm/shared/constants';
import { parseVrmAvatarId, type StageCastMember } from '@wbfm/shared/schemas';

/**
 * 剧场三席 VRM 预加载：把静态模型提前放进 HTTP 缓存。
 * 首次进入与模型加载并行，二次进入直接命中缓存；导入模型不带 token，跳过。
 */
export function useTheaterPreload(cast: StageCastMember[], enabled: boolean): void {
  const key = cast.map((member) => member.avatarModelId).join('|');

  React.useEffect(() => {
    if (!enabled) return;
    const links: HTMLLinkElement[] = [];
    for (const modelId of key.split('|')) {
      const fileRef = parseVrmAvatarId(modelId);
      const href = fileRef ? resolveBuiltinVrmAsset(fileRef) : null;
      if (!href) continue;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'fetch';
      // 与 GLTFLoader 的 fetch（same-origin credentials）保持一致，
      // 否则浏览器判为 credentials 不匹配，preload 命中不了会重复下载
      link.crossOrigin = 'anonymous';
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      for (const link of links) link.remove();
    };
  }, [enabled, key]);
}
