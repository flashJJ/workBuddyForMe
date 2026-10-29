'use client';

import * as React from 'react';
import type { WorkSignalSnapshot } from '@wbfm/shared';

export interface WorkSignalState {
  snapshot: WorkSignalSnapshot | null;
  connected: boolean;
}

function streamUrl(): string {
  const base = typeof window !== 'undefined' ? window.wbfm?.baseUrl ?? '' : '';
  return `${base.replace(/\/$/, '')}/api/work-signals/stream`;
}

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? window.wbfm?.token : undefined;
  return token ? { 'x-wbfm-token': token } : {};
}

function parseBlock(block: string, onSnapshot: (snapshot: WorkSignalSnapshot) => void): void {
  const lines = block.split('\n');
  const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
  const data = lines.find((line) => line.startsWith('data: '))?.slice(6);
  if (event !== 'work_signal' || !data) return;
  try {
    onSnapshot(JSON.parse(data) as WorkSignalSnapshot);
  } catch {
    // 非法帧丢弃，下一次快照会覆盖
  }
}

async function consume(
  response: Response,
  onSnapshot: (snapshot: WorkSignalSnapshot) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('work signal stream has no body');
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n\n');
    while (index >= 0) {
      parseBlock(buffer.slice(0, index), onSnapshot);
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf('\n\n');
    }
  }
}

const RECONNECT_MS = 3_000;

/**
 * v2.7 桌宠工作信号订阅：独立于主窗页面的 SSE 连接。
 * 断线时返回 connected=false（桌宠据此显示 DISCONNECTED），并自动重连。
 */
export function useWorkSignals(enabled: boolean): WorkSignalState {
  const [snapshot, setSnapshot] = React.useState<WorkSignalSnapshot | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      setConnected(false);
      return;
    }
    let stopped = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(streamUrl(), {
          headers: authHeaders(),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`work signal stream ${response.status}`);
        setConnected(true);
        await consume(response, setSnapshot, controller.signal);
      } catch {
        if (stopped) return;
        setConnected(false);
      } finally {
        controller = null;
        if (!stopped) timer = setTimeout(run, RECONNECT_MS);
      }
    };

    void run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [enabled]);

  return { snapshot, connected };
}
