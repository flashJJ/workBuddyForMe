'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FlowDiagnostic,
  FlowEventPayload,
  FlowGraph,
  FlowHumanSubmitInput,
  FlowNodeExecStatus,
  WorkflowRunView,
  WorkflowVersionView,
  WorkflowView,
  WorkflowCreateInput,
  WorkflowUpdateInput,
} from '@wbfm/shared';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 工作流详情：元信息 + 当前版本图（无版本 graph=null） */
export interface FlowDetail {
  workflow: WorkflowView;
  graph: FlowGraph | null;
  version: number;
}

export function useFlows() {
  return useQuery({
    queryKey: QUERY_KEYS.flows,
    queryFn: () => apiGet<WorkflowView[]>(API.flows),
    staleTime: 3_000,
  });
}

export function useFlow(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.flow(id) : ['flows', 'disabled'],
    queryFn: () => apiGet<FlowDetail>(API.flow(id!)),
    enabled: Boolean(id),
  });
}

export function useFlowMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.flows });
  const invalidateOne = (id: string) =>
    qc.invalidateQueries({ queryKey: QUERY_KEYS.flow(id) });

  return {
    create: useMutation({
      mutationFn: (body: WorkflowCreateInput) => apiPost<WorkflowView>(API.flows, body),
      onSuccess: invalidateList,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: WorkflowUpdateInput }) =>
        apiPatch<WorkflowView>(API.flow(id), body),
      onSuccess: (wf) => {
        invalidateList();
        invalidateOne(wf.id);
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.flow(id)),
      onSuccess: (_data, id) => {
        invalidateList();
        qc.removeQueries({ queryKey: QUERY_KEYS.flow(id) });
      },
    }),
    saveVersion: useMutation({
      mutationFn: ({ id, graph }: { id: string; graph: FlowGraph }) =>
        apiPost<WorkflowVersionView>(API.flowVersions(id), { graph }),
      onSuccess: (_data, vars) => {
        invalidateList();
        invalidateOne(vars.id);
      },
    }),
    validate: useMutation({
      mutationFn: ({ id, graph }: { id: string; graph?: FlowGraph }) =>
        apiPost<{ ok: boolean; diagnostics: FlowDiagnostic[] }>(
          API.flowValidate(id),
          graph ? { graph } : {},
        ),
    }),
    publish: useMutation({
      mutationFn: (id: string) => apiPost<WorkflowView>(API.flowPublish(id)),
      onSuccess: (wf) => {
        invalidateList();
        invalidateOne(wf.id);
      },
    }),
  };
}

export interface RunDetail {
  run: WorkflowRunView;
  nodes: Array<{
    nodeId: string;
    status: FlowNodeExecStatus;
    error: string | null;
    durationMs: number;
  }>;
  active: boolean;
}

export function useFlowRunDetail(runId: string | null) {
  return useQuery({
    queryKey: runId ? QUERY_KEYS.flowRun(runId) : ['flow-run', 'disabled'],
    queryFn: () => apiGet<RunDetail>(API.flowRun(runId!)),
    enabled: Boolean(runId),
  });
}

export function useFlowRunAction(runId: string | null) {
  const create = useMutation({
    mutationFn: ({ workflowId, input }: { workflowId: string; input: Record<string, unknown> }) =>
      apiPost<{ runId: string }>(API.flowRuns(workflowId), { input }),
  });
  const submitHuman = useMutation({
    mutationFn: (body: FlowHumanSubmitInput) =>
      apiPost<{ ok: boolean }>(API.flowRunHuman(runId!), body),
  });
  const submitToolConfirm = useMutation({
    mutationFn: (body: { nodeId: string; allowed: boolean }) =>
      apiPost<{ ok: boolean }>(API.flowRunToolConfirm(runId!), body),
  });
  const cancel = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>(API.flowRunControl(runId!), { action: 'cancel' }),
  });
  return { create, submitHuman, submitToolConfirm, cancel };
}

// ── SSE 运行事件流 ──

export type FlowRunPhase =
  | 'connecting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface FlowLiveState {
  events: FlowEventPayload[];
  /** nodeId → 节点执行状态（画布高亮/时间线共用） */
  nodeStatus: Record<string, FlowNodeExecStatus>;
  /** 当前挂起中的节点（人工审核或危险工具授权） */
  waitingNodeId: string | null;
  phase: FlowRunPhase;
  connection: 'connecting' | 'open' | 'closed' | 'error';
  output: unknown;
  errorMessage: string | null;
  errorNodeId: string | null;
}

const INITIAL_LIVE: FlowLiveState = {
  events: [],
  nodeStatus: {},
  waitingNodeId: null,
  phase: 'connecting',
  connection: 'connecting',
  output: null,
  errorMessage: null,
  errorNodeId: null,
};

/**
 * 订阅工作流运行 SSE：挂载即连、卸载即关。
 * 终态运行由服务端回放节点记录，同一套事件归一处理。
 */
export function useFlowRunEvents(runId: string | null): FlowLiveState {
  const [state, setState] = React.useState<FlowLiveState>(INITIAL_LIVE);

  React.useEffect(() => {
    if (!runId) {
      setState(INITIAL_LIVE);
      return;
    }
    setState(INITIAL_LIVE);

    const token = (globalThis as { window?: { wbfm?: { token?: string } } }).window?.wbfm?.token;
    const url = `${API.flowRunEvents(runId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(url);
    // 同一订阅内去重：终态运行的服务端回放可能因 EventSource 自动重连而重复
    const seen = new Set<string>();

    es.onopen = () =>
      setState((s) => ({ ...s, connection: 'open', phase: s.phase === 'connecting' ? 'running' : s.phase }));
    es.onerror = () =>
      setState((s) => ({ ...s, connection: s.phase === 'running' || s.phase === 'connecting' ? 'error' : 'closed' }));
    es.addEventListener('flow', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as FlowEventPayload;
        // 同一运行中每类节点事件只出现一次；run 级事件按 type 去重
        const dedupeKey =
          'nodeId' in payload ? `${payload.type}:${payload.nodeId}` : payload.type;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        setState((s) => applyFlowEvent(s, payload));
        // 关键：终态后服务端会关闭流，必须主动 es.close()，否则浏览器自动重连→重放→风暴
        if (
          payload.type === 'run_succeeded' ||
          payload.type === 'run_failed' ||
          payload.type === 'run_cancelled'
        ) {
          es.close();
        }
      } catch {
        /* 忽略异常帧 */
      }
    });

    return () => es.close();
  }, [runId]);

  return state;
}

function applyFlowEvent(prev: FlowLiveState, e: FlowEventPayload): FlowLiveState {
  const next: FlowLiveState = {
    ...prev,
    events: [...prev.events, e],
    nodeStatus: { ...prev.nodeStatus },
  };
  switch (e.type) {
    case 'run_started':
      next.phase = 'running';
      break;
    case 'node_started':
      next.nodeStatus[e.nodeId] = 'running';
      if (prev.waitingNodeId === e.nodeId) next.waitingNodeId = null;
      break;
    case 'node_succeeded':
      next.nodeStatus[e.nodeId] = 'succeeded';
      if (prev.waitingNodeId === e.nodeId) next.waitingNodeId = null;
      break;
    case 'node_skipped':
      next.nodeStatus[e.nodeId] = 'skipped';
      break;
    case 'node_waiting_human':
      next.nodeStatus[e.nodeId] = 'waiting_human';
      next.waitingNodeId = e.nodeId;
      break;
    case 'node_failed':
      next.nodeStatus[e.nodeId] = 'failed';
      break;
    case 'run_succeeded':
      next.phase = 'succeeded';
      next.connection = 'closed';
      next.output = e.output;
      next.waitingNodeId = null;
      break;
    case 'run_failed':
      next.phase = 'failed';
      next.connection = 'closed';
      next.errorMessage = e.message;
      next.errorNodeId = e.nodeId ?? null;
      next.waitingNodeId = null;
      break;
    case 'run_cancelled':
      next.phase = 'cancelled';
      next.connection = 'closed';
      next.waitingNodeId = null;
      break;
  }
  return next;
}
