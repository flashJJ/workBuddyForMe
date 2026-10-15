'use client';

import * as React from 'react';
import { API } from '@/lib/api/endpoints';
import { apiGet, withManagedHeaders } from '@/lib/api/client';
import { SseReader, type RawSseEvent } from '@/lib/api/sse-reader';
import type { AgentRunView } from '@wbfm/shared/schemas';
import {
  adaptStageFrame,
  INITIAL_STAGE_ADAPTER_STATE,
  openingDirections,
  type StageAdapterState,
  type StageAgentFrame,
} from '@wbfm/core/stage-client';
import type { StageController } from './use-stage-controller';

/**
 * v1.9 M2：舞台只读订阅协作 run（?observe=1）。
 * - 只订阅不控制：无 cancel/审批/返工通道，关窗/退订不 abort run；
 * - 晚加入：服务端总线回放整场 + 终态走落库 handoff 回放，适配器无状态差别；
 * - owner 尚未接通时服务端 409：1s 退避重连（上限 30 次）；
 * - 流意外断开且 run 仍在 running：查状态后重连续看。
 */

const AGENT_EVENT_NAMES = new Set<RawSseEvent['event']>([
  'agent_phase',
  'agent_handoff',
  'agent_review',
  'agent_budget',
  'agent_delta',
  'agent_tool_confirm',
  'done',
  'error',
]);

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 1000;

function narrow(raw: RawSseEvent): StageAgentFrame | null {
  return AGENT_EVENT_NAMES.has(raw.event) ? (raw as unknown as StageAgentFrame) : null;
}

export function useStageRun(runId: string | null, controller: StageController): void {
  // 适配器状态按订阅会话串行持有；重连续看时不清空（已演指令幂等）
  const adapterRef = React.useRef<StageAdapterState>({ ...INITIAL_STAGE_ADAPTER_STATE });

  React.useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let aborted = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controllerSignal = new AbortController();

    // 开场演员表（场景 cast 覆盖 M3 会议再接，M2 用角色默认形象）
    // runId 在水合后才就绪，mode 会经历 mock→run 翻转，初始 state 不重算，
    // 因此订阅入口必须显式置 connecting（否则状态角标永不出现）。
    controller.setRunStatus('connecting');
    for (const d of openingDirections()) controller.applyDirection(d);

    const scheduleRetry = (fn: () => void): boolean => {
      if (stopped || attempt >= MAX_RETRIES) {
        if (!stopped) controller.setRunStatus('failed');
        return false;
      }
      attempt += 1;
      timer = setTimeout(fn, RETRY_DELAY_MS);
      return true;
    };

    const connect = async (): Promise<void> => {
      if (stopped) return;
      let response: Response;
      try {
        response = await fetch(
          API.agentRunEvents(runId, true),
          withManagedHeaders({ signal: controllerSignal.signal }),
        );
      } catch {
        if (stopped || controllerSignal.signal.aborted) return;
        scheduleRetry(connect);
        return;
      }
      if (stopped) return;

      if (response.status === 409) {
        // owner SSE 尚未接通（建主窗与舞台窗的正常竞态）→ 退避重连
        scheduleRetry(connect);
        return;
      }
      if (!response.ok || !response.body) {
        controller.setRunStatus('failed');
        return;
      }

      attempt = 0;
      controller.setRunStatus('running');
      let terminal = false;

      try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const raw of parser.feed(decoder.decode(value, { stream: true }))) {
            const frame = narrow(raw);
            if (!frame) continue;
            for (const direction of adaptStageFrame(adapterRef.current, frame)) {
              controller.applyDirection(direction);
            }
            if (frame.event === 'done') {
              terminal = true;
              controller.setRunStatus('done');
            } else if (frame.event === 'error') {
              terminal = true;
              controller.setRunStatus('failed');
            }
          }
        }
      } catch {
        aborted = controllerSignal.signal.aborted;
      }
      if (stopped || aborted) return;

      // 流关闭但未见终帧：查 run 状态，running 则重连续看，其余落终态
      if (terminal) return;
      try {
        const run = await apiGet<AgentRunView>(API.agentRun(runId));
        const status = run.status;
        if (status === 'running') scheduleRetry(connect);
        else controller.setRunStatus(status === 'done' ? 'done' : 'failed');
      } catch {
        scheduleRetry(connect);
      }
    };

    void connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controllerSignal.abort();
    };
    // controller 方法均为稳定回调；runId 是唯一重订阅触发点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
}
