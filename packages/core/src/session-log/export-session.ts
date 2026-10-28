import { strToU8, zipSync } from 'fflate';
import {
  createAgentRunRepository,
  createMessageRepository,
  createTaskRunRepository,
  createWorkflowRunRepository,
  type SessionEventScope,
  type SessionEventView,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import type { SessionLogService } from './session-log-service';

/**
 * v2.9 会话/运行导出 ZIP：
 * - 事件 JSONL + 业务投影（消息/步骤/handoff/节点）+ manifest；
 * - 默认脱敏：移除密钥字段、掩码 sk-/Bearer 等令牌、省略工具参数原文；
 * - 不包含附件二进制与系统凭据。
 */

const SECRET_KEY = /^(api_?key|authorization|secret|password|access_?token)$/i;
const SECRET_TEXT = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|ghp_[A-Za-z0-9]{8,}|xox[bap]-[A-Za-z0-9-]{8,})/g;

function maskText(text: string): string {
  return text.replace(SECRET_TEXT, '[REDACTED]');
}

/** 递归脱敏（数组/对象/字符串）；超过 6 层直接截断为字符串 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = redactValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** redact=0：保留结构，仅掩码疑似令牌（系统凭据仍不落导出） */
function sanitizeSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeSecrets(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeSecrets(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** 工具参数在脱敏模式下替换为占位（保留字段存在性，不泄露原文） */
function redactMessage(
  message: Record<string, unknown>,
  redact: boolean,
): Record<string, unknown> {
  const copy = (redact ? redactValue(message) : sanitizeSecrets(message)) as Record<string, unknown>;
  if (redact) {
    if ('argsJson' in copy) copy.argsJson = '[REDACTED]';
    if ('args_json' in copy) copy.args_json = '[REDACTED]';
  }
  return copy;
}

function jsonl(events: SessionEventView[], redact: boolean): Uint8Array {
  const lines = events.map((event) =>
    JSON.stringify({
      ...event,
      payload: redact ? redactValue(event.payload) : sanitizeSecrets(event.payload),
    }),
  );
  return strToU8(`${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`);
}

function json(value: unknown, redact: boolean): Uint8Array {
  return strToU8(
    JSON.stringify(redact ? redactValue(value) : sanitizeSecrets(value), null, 2),
  );
}

export interface ExportSessionResult {
  fileName: string;
  bytes: Uint8Array;
  entries: string[];
  eventCount: number;
  redacted: boolean;
}

export function createSessionExportService(deps: ServiceDeps, logs: SessionLogService) {
  return {
    export(input: {
      scope: SessionEventScope;
      scopeId: string;
      redact?: boolean;
    }): ExportSessionResult {
      const redact = input.redact ?? true;
      const events = logs.listAll({ scope: input.scope, scopeId: input.scopeId, limit: 5000 }).slice();
      // listAll 倒序，导出按 seq 正序（同一 scope 内）
      const ordered = events.sort((a, b) => a.seq - b.seq);
      const files: Record<string, Uint8Array> = {
        'events.jsonl': jsonl(ordered, redact),
      };
      const counts: Record<string, number> = { events: ordered.length };
      const db = deps.db;

      if (input.scope === 'chat') {
        const messages = createMessageRepository(db)
          .listByConversation(input.scopeId, 5000)
          .map((message) => redactMessage(message as unknown as Record<string, unknown>, redact));
        files['messages.json'] = strToU8(JSON.stringify(messages, null, 2));
        counts.messages = messages.length;
      } else if (input.scope === 'task') {
        const repo = createTaskRunRepository(db);
        const run = repo.getRun(input.scopeId);
        const steps = repo.listSteps(input.scopeId).map((step) =>
          redactMessage(step as unknown as Record<string, unknown>, redact),
        );
        if (run) files['run.json'] = json(run, redact);
        files['steps.json'] = strToU8(JSON.stringify(steps, null, 2));
        counts.steps = steps.length;
      } else if (input.scope === 'agent') {
        const repo = createAgentRunRepository(db);
        const run = repo.getById(input.scopeId);
        files['handoffs.json'] = json(repo.listHandoffs(input.scopeId), redact);
        if (run) files['run.json'] = json(run, redact);
        counts.handoffs = repo.listHandoffs(input.scopeId).length;
      } else {
        const run = createWorkflowRunRepository(db).getRun(input.scopeId);
        if (run) files['run.json'] = json(run, redact);
        const nodes = db
          .prepare(`SELECT * FROM node_executions WHERE run_id = ? ORDER BY rowid ASC`)
          .all(input.scopeId) as Array<Record<string, unknown>>;
        files['nodes.json'] = json(nodes, redact);
        counts.nodes = nodes.length;
      }

      const manifest = {
        version: 1,
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        scope: input.scope,
        scopeId: input.scopeId,
        redacted: redact,
        entries: [
          ...Object.keys(files).map((name) => ({ name, byteSize: files[name]!.byteLength })),
          // manifest 自身也列入条目清单（字节数在写入后确定，标记 0 以免自引用膨胀）
          { name: 'manifest.json', byteSize: 0 },
        ],
        counts,
      };
      files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
      const bytes = zipSync(files);
      return {
        fileName: `wbfm-${input.scope}-${input.scopeId}.zip`,
        bytes,
        entries: Object.keys(files),
        eventCount: ordered.length,
        redacted: redact,
      };
    },
  };
}

export type SessionExportService = ReturnType<typeof createSessionExportService>;
