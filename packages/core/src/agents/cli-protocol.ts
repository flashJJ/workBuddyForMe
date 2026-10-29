import { SUBAGENT_CLI_PROTOCOL_VERSION } from '@wbfm/shared/schemas';
import type { SubagentProviderInput } from './subagent-provider';

/**
 * v2.11 外部代理 JSON Lines 协议（stdin/stdout 各一行一个 JSON）。
 * 本文件只做纯解析/序列化，便于独立单测与夹具复用。
 */

export const CLI_MAX_LINE_BYTES = 65_536;
export const CLI_MAX_DIAGNOSTICS = 10;
export const CLI_MAX_STDERR_BYTES = 65_536;

export type CliFrame =
  | { type: 'delta'; text: string }
  | { type: 'permission'; id: string; title: string; detail?: string }
  | { type: 'done'; summary?: string }
  | { type: 'error'; code?: string; message?: string };

export type CliParseResult =
  | { kind: 'frame'; frame: CliFrame }
  | { kind: 'invalid'; reason: string }
  | { kind: 'empty' };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解析子进程的一行输出；`invalid` 交由调用方决定是否终止 */
export function parseCliLine(raw: string): CliParseResult {
  const line = raw.trim();
  if (!line) return { kind: 'empty' };
  if (Buffer.byteLength(line, 'utf8') > CLI_MAX_LINE_BYTES) {
    return { kind: 'invalid', reason: '单行输出超过 64KB' };
  }
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { kind: 'invalid', reason: '非 JSON 行' };
  }
  if (!isObject(value) || typeof value.type !== 'string') {
    return { kind: 'invalid', reason: '缺少 type 字段' };
  }
  switch (value.type) {
    case 'delta':
      return typeof value.text === 'string'
        ? { kind: 'frame', frame: { type: 'delta', text: value.text } }
        : { kind: 'invalid', reason: 'delta.text 必须是字符串' };
    case 'permission':
      if (typeof value.id !== 'string' || typeof value.title !== 'string') {
        return { kind: 'invalid', reason: 'permission 缺少 id/title' };
      }
      return {
        kind: 'frame',
        frame: {
          type: 'permission',
          id: value.id,
          title: value.title,
          ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
        },
      };
    case 'done':
      if (value.summary !== undefined && typeof value.summary !== 'string') {
        return { kind: 'invalid', reason: 'done.summary 必须是字符串' };
      }
      return { kind: 'frame', frame: { type: 'done', ...(value.summary ? { summary: value.summary } : {}) } };
    case 'error':
      if (
        (value.code !== undefined && typeof value.code !== 'string') ||
        (value.message !== undefined && typeof value.message !== 'string')
      ) {
        return { kind: 'invalid', reason: 'error.code/message 必须是字符串' };
      }
      return {
        kind: 'frame',
        frame: {
          type: 'error',
          ...(value.code ? { code: value.code } : {}),
          ...(value.message ? { message: value.message } : {}),
        },
      };
    default:
      return { kind: 'invalid', reason: `未知 type：${value.type}` };
  }
}

/** 宿主写入首帧（一次） */
export function buildRunLine(input: SubagentProviderInput): string {
  return JSON.stringify({
    type: 'run',
    protocol: SUBAGENT_CLI_PROTOCOL_VERSION,
    goal: input.goal,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.budget ? { budget: input.budget } : {}),
  });
}

export function buildPermissionResultLine(id: string, allow: boolean): string {
  return JSON.stringify({ type: 'permission_result', id, allow });
}

/** 未知/结构非法的行只做诊断；`fatal` 表示必须终止（未知 type / 超长行） */
export function isFatalParseFailure(result: CliParseResult): boolean {
  return result.kind === 'invalid' && /未知 type|超过 64KB/.test(result.reason);
}
