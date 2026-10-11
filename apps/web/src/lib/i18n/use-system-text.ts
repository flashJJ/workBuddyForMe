'use client';

import * as React from 'react';
import { renderEmbeddedMessages, type MessageKey, type MessageVars } from '@wbfm/shared/i18n';
import { useI18n } from './use-i18n';

/**
 * 系统轨迹文本解码（渲染端）：
 * core 把系统模板以语言中立的 system-message 线格式存入 outcome/errorMessage/step 等字段，
 * 此 hook 按当前 UI 语言把标记渲染为译文；模型自由产出与历史旧数据原样透传。
 */
export function useSystemText(): (raw?: string | null) => string {
  const { t } = useI18n();
  return React.useCallback(
    (raw?: string | null) => {
      if (!raw) return '';
      return renderEmbeddedMessages(raw, (key, vars) => t(key as MessageKey, vars as MessageVars));
    },
    [t],
  );
}
