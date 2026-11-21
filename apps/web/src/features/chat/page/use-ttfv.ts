'use client';

import * as React from 'react';

const STARTED_AT = typeof performance === 'undefined' ? 0 : performance.now();

/** v4.17：开发态记录「打开应用 → 第一条回答」耗时，不进入生产 UI */
export function useTtfv(hasAnswer: boolean): void {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !hasAnswer) return;
    console.info('[ttfv] first answer ready in', Math.round(performance.now() - STARTED_AT), 'ms');
  }, [hasAnswer]);
}
