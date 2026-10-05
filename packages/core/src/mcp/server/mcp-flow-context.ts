import type { FlowInputField, WorkflowEndpointView } from '@wbfm/shared';
import type { WorkflowRepository } from '@wbfm/database';
import { readFlowStartFields, validateFlowStartInput } from '../../serving/start-input';
import type { FlowRunService } from '../../flow/run-service';
import { describeFlowAsMcpTool } from './describe-tool';
import {
  McpInvalidParamsError,
  type McpCallResult,
  type McpServerContext,
} from './mcp-server-core';

/**
 * v0.9 MCP 调用上下文装配：已鉴权端点 → tools/list 与 tools/call。
 * v1 一密钥一端点一流程：该 token 只能发现/调用端点绑定的流程，
 * 密钥间隔离与 HTTP invoke 完全一致。
 */

/** MCP tools/call 同步等待上限（超时后返回 runId 指引文本，不把客户端吊死） */
export const MCP_CALL_TIMEOUT_MS = 90_000;

export const MCP_FLOW_SERVER_INFO = { name: 'workbuddy-flow', version: '0.9.0' } as const;

export interface McpFlowContextDeps {
  endpoint: WorkflowEndpointView;
  workflows: WorkflowRepository;
  flowRunner: FlowRunService;
  serverInfo?: { name: string; version: string };
  callTimeoutMs?: number;
}

function outputToText(output: unknown): string {
  return typeof output === 'string' ? output : JSON.stringify(output);
}

export function createMcpFlowContext(deps: McpFlowContextDeps): McpServerContext {
  const { endpoint, workflows, flowRunner } = deps;
  const serverInfo = deps.serverInfo ?? MCP_FLOW_SERVER_INFO;
  const timeoutMs = deps.callTimeoutMs ?? MCP_CALL_TIMEOUT_MS;

  function loadTool() {
    const wf = workflows.getWorkflow(endpoint.workflowId);
    const version = workflows.getCurrentVersion(endpoint.workflowId);
    if (!wf || wf.status !== 'published' || !version) return null;
    const fields: FlowInputField[] = readFlowStartFields(version.graph);
    return { wf, graph: version.graph, fields };
  }

  return {
    serverInfo,
    async listTools() {
      const loaded = loadTool();
      return loaded ? [describeFlowAsMcpTool(loaded.wf, loaded.graph)] : [];
    },
    async callTool(name, args): Promise<McpCallResult | null> {
      const loaded = loadTool();
      if (!loaded) return null;
      const descriptor = describeFlowAsMcpTool(loaded.wf, loaded.graph);
      if (name !== descriptor.name) return null;

      let input: Record<string, unknown>;
      try {
        input = validateFlowStartInput(loaded.fields, args);
      } catch (error) {
        const details =
          error instanceof Error && 'details' in error
            ? (error as { details: unknown }).details
            : [{ path: '', message: '入参校验失败' }];
        throw new McpInvalidParamsError(details);
      }

      const runId = flowRunner.createRun({
        workflowId: endpoint.workflowId,
        input,
        trigger: 'mcp',
        endpointId: endpoint.id,
      });
      const result = await flowRunner.waitForTerminal(runId, timeoutMs);
      const run = result.run;
      if (result.timedOut || !run) {
        return {
          content: [
            {
              type: 'text',
              text: `流程仍在执行（超过 ${Math.round(timeoutMs / 1000)}s 等待上限）。runId=${runId}，可通过 HTTP API 轮询获取结果。`,
            },
          ],
        };
      }
      if (run.status === 'succeeded') {
        return { content: [{ type: 'text', text: outputToText(run.output) }] };
      }
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              runId,
              status: run.status,
              ...(run.error ? { error: run.error } : {}),
              ...(run.interruptReason ? { interruptReason: run.interruptReason } : {}),
            }),
          },
        ],
      };
    },
  };
}
