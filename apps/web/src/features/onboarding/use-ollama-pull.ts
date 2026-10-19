'use client';

import * as React from 'react';
import { API } from '@/lib/api/endpoints';
import { withManagedHeaders } from '@/lib/api/client';
import { SseReader } from '@/lib/api/sse-reader';

export type OllamaPullState =
  | { status: 'idle' }
  | { status: 'pulling'; percent: number | null; completed: number | null; total: number | null }
  | { status: 'done' }
  | { status: 'error'; message: string };

interface ProgressData {
  total?: number | null;
  completed?: number | null;
  percent?: number | null;
}

/**
 * v2.4 P0-1（T4）：一键拉取本机 Ollama 模型（POST + SSE 进度），支持取消。
 * 只在用户显式点击时发起——不静默下载（红线）。
 */
export function useOllamaPull() {
  const controllerRef = React.useRef<AbortController | null>(null);
  const [state, setState] = React.useState<OllamaPullState>({ status: 'idle' });

  const cancel = React.useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: 'idle' });
  }, []);

  const start = React.useCallback(async (model: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'pulling', percent: 0, completed: null, total: null });

    try {
      const response = await fetch(
        API.systemOllamaPull,
        withManagedHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model }),
          signal: controller.signal,
        }),
      );
      if (!response.ok || !response.body) {
        setState({ status: 'error', message: `HTTP ${response.status}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const raw of parser.feed(decoder.decode(value, { stream: true }))) {
          if (raw.event === 'progress') {
            const data = raw.data as ProgressData;
            setState({
              status: 'pulling',
              percent: data.percent ?? null,
              completed: data.completed ?? null,
              total: data.total ?? null,
            });
          } else if (raw.event === 'done') {
            setState({ status: 'done' });
          } else if (raw.event === 'error') {
            const data = raw.data as { message?: string };
            setState({ status: 'error', message: data.message ?? '拉取中断' });
          }
        }
      }
    } catch {
      // 主动取消不报错；仅真正的网络中断落错误态
      if (!controller.signal.aborted) setState({ status: 'error', message: '连接中断' });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  React.useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, start, cancel };
}
