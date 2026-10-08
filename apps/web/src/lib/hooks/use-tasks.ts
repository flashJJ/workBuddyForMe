'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TaskCreateInput,
  TaskRunView,
  TaskStepView,
  TaskEventPayload,
} from '@wbfm/shared/schemas';
import { apiGet, apiPost, withManagedHeaders } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 任务详情：运行 + 步骤列表 */
export interface TaskDetail {
  run: TaskRunView;
  steps: TaskStepView[];
}

/** 全部任务列表（跨会话，按创建时间倒序） */
export function useTasks() {
  return useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: () => apiGet<TaskRunView[]>(API.tasks),
    // v0.7：任务面板频繁刷新意义不大；SSE 推送时手动 invalidate
    staleTime: 5_000,
  });
}

/** 单个任务详情：运行 + 步骤（步骤时间线数据源） */
export function useTask(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.task(id) : ['task', 'disabled'],
    queryFn: () => apiGet<TaskDetail>(API.task(id!)),
    enabled: !!id,
  });
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
  };

  return {
    create: useMutation({
      mutationFn: (input: TaskCreateInput) =>
        apiPost<TaskRunView>(API.tasks, input),
      onSuccess: invalidateAll,
    }),
    control: useMutation({
      mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' | 'stop' }) =>
        apiPost<{ ok: boolean }>(API.taskControl(id), { action }),
      onSuccess: (_data, vars) => {
        invalidateAll();
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.task(vars.id) });
      },
    }),
    stopAll: useMutation({
      mutationFn: () => apiPost<{ stopped: number }>(API.taskStopAll),
      onSuccess: invalidateAll,
    }),
  };
}

/**
 * 订阅任务事件流（SSE）。
 * 返回实时 run + steps（按 stepIndex 升序）+ 连接状态。
 * 组件挂载即开 EventSource，卸载自动关闭。
 */
export interface TaskLiveState {
  run: TaskRunView | null;
  steps: TaskStepView[];
  /** connecting / open / closed / error */
  status: 'connecting' | 'open' | 'closed' | 'error';
}

export function useTaskEvents(runId: string | null): TaskLiveState {
  const [run, setRun] = React.useState<TaskRunView | null>(null);
  const [steps, setSteps] = React.useState<TaskStepView[]>([]);
  const [status, setStatus] = React.useState<'connecting' | 'open' | 'closed' | 'error'>(
    'connecting',
  );

  React.useEffect(() => {
    if (!runId) {
      setRun(null);
      setSteps([]);
      setStatus('closed');
      return;
    }
    // 重置状态（切换任务时）
    setRun(null);
    setSteps([]);
    setStatus('connecting');

    const token = (globalThis as { window?: { wbfm?: { token?: string } } }).window?.wbfm?.token;
    const url = `${API.taskEvents(runId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(url);

    es.onopen = () => setStatus('open');
    es.onerror = () => {
      setStatus((prev) => (prev === 'open' ? 'closed' : 'error'));
    };
    es.addEventListener('task', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as TaskEventPayload;
        applyEvent(payload, setRun, setSteps);
      } catch {
        /* 忽略解析失败 */
      }
    });

    return () => {
      es.close();
    };
  }, [runId]);

  return { run, steps, status };
}

function applyEvent(
  payload: TaskEventPayload,
  setRun: React.Dispatch<React.SetStateAction<TaskRunView | null>>,
  setSteps: React.Dispatch<React.SetStateAction<TaskStepView[]>>,
) {
  if (payload.run) setRun(payload.run);
  if (!payload.step) return;
  setSteps((prev) => {
    const idx = prev.findIndex((s) => s.id === payload.step!.id);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = payload.step!;
      return next;
    }
    return [...prev, payload.step!].sort((a, b) => a.stepIndex - b.stepIndex);
  });
}

/** 仅供测试：用 fetch 拉一次任务事件流并解析为事件数组 */
export async function fetchTaskEventsForTest(
  runId: string,
  signal?: AbortSignal,
): Promise<TaskEventPayload[]> {
  const res = await fetch(API.taskEvents(runId), withManagedHeaders({ signal }));
  if (!res.ok || !res.body) throw new Error(`events fetch failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  const events: TaskEventPayload[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    const blocks = raw.split('\n\n');
    raw = blocks.pop() ?? '';
    for (const block of blocks) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (dataLine) {
        try {
          events.push(JSON.parse(dataLine.slice(6)) as TaskEventPayload);
        } catch {
          /* skip */
        }
      }
    }
  }
  return events;
}
