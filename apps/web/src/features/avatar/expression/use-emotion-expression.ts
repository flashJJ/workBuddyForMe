'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import {
  baselineExpression,
  type EmotionState,
  type ExpressionTag,
} from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { DEFAULT_EXPRESSION, latestExpression } from './expression-parser';

/**
 * v1.6 M3 / v1.7 情绪状态与表情源：
 * 1. 流式/最近助手回复里的内联 [表情] 标签优先（说话过程实时）；
 * 2. 无显式标签时回落到持久化情绪基线（GET emotion 的 baselineExpression）——
 *    回复结束后表情由跨轮情绪状态承接「余韵」。
 * v1.7：同时返回原始 EmotionState，供事件条件上下文（mood/relation/counters）复用，
 * 全页只发一次 GET。
 */
export function useEmotionState(
  assistantId: string,
  messages: Message[],
  proactiveContent?: string | null,
): { state: EmotionState | null; expression: ExpressionTag } {
  const [state, setState] = React.useState<EmotionState | null>(null);

  const assistantMessageCount = React.useMemo(
    () => messages.filter((m) => m.role === 'assistant').length,
    [messages],
  );

  React.useEffect(() => {
    if (!assistantId) return;
    let cancelled = false;
    apiGet<EmotionState>(`/api/assistants/${assistantId}/emotion`)
      .then((value) => {
        // 缺字段的异常/旧快照不入库（baselineExpression 假定 mood/relation 存在）
        if (!cancelled && value?.mood && value.relation) setState(value);
      })
      .catch(() => {
        /* 情绪基线拉取失败不影响对话形象/事件触发 */
      });
    return () => {
      cancelled = true;
    };
  }, [assistantId, assistantMessageCount]);

  const expression = React.useMemo(() => {
    if (proactiveContent) {
      const tag = latestExpression(proactiveContent);
      if (tag) return tag;
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === 'assistant') {
        return latestExpression(message.content) ?? (state ? baselineExpression(state) : DEFAULT_EXPRESSION);
      }
    }
    return state ? baselineExpression(state) : DEFAULT_EXPRESSION;
  }, [messages, proactiveContent, state]);

  return { state, expression };
}

/** 兼容旧调用方：只要表情标签 */
export function useEmotionExpression(
  assistantId: string,
  messages: Message[],
  proactiveContent?: string | null,
): ExpressionTag {
  return useEmotionState(assistantId, messages, proactiveContent).expression;
}
