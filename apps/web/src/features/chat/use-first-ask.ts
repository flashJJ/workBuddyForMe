'use client';

import * as React from 'react';
import { FIRST_ASK_EVENT, takePendingFirstAsk } from '@/features/onboarding/first-ask';

/**
 * v2.4 M1 T6：消费向导 firstAsk 步选中的示例问题——模型就绪后自动发出一次。
 * 两个触发时机：模型就绪（ready 变化）与示例问题就绪（自定义事件）；未就绪则等待。
 */
export function useFirstAsk(send: (content: string) => void, ready: boolean): void {
  const stateRef = React.useRef({ send, ready, done: false });
  stateRef.current.send = send;
  stateRef.current.ready = ready;

  const maybeSend = React.useCallback(() => {
    const state = stateRef.current;
    if (state.done || !state.ready) return;
    const pending = takePendingFirstAsk();
    if (!pending) return;
    state.done = true;
    state.send(pending);
  }, []);

  React.useEffect(() => {
    maybeSend();
    window.addEventListener(FIRST_ASK_EVENT, maybeSend);
    return () => window.removeEventListener(FIRST_ASK_EVENT, maybeSend);
  }, [ready, maybeSend]);
}
