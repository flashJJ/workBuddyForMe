import type { ChatMessage, ChatParams } from '../../types';

/**
 * 部分 OpenAI 兼容上游（如 DeepSeek 新版）按 `^[a-zA-Z0-9_-]+$` 严格校验
 * function 名，而本应用内部用 `mcp:<server>:<tool>` / `flow:<id>` 限定名。
 * 下发前转义、回包后还原，保证内部工具解析与展示不变。
 */
const WIRE_UNSAFE_CHAR = /[^a-zA-Z0-9_-]/;
const WIRE_UNSAFE_ALL = /[^a-zA-Z0-9_-]/g;
const WIRE_NAME_MAX = 64;

export interface WireToolNameCodec {
  toWire(name: string): string;
  toOriginal(name: string): string;
}

/** 收集本次请求会出现在线上格式里的全部工具名（声明 + 历史工具调用/结果） */
function collectToolNames(params: ChatParams): Set<string> {
  const names = new Set<string>();
  for (const tool of params.tools ?? []) names.add(tool.function.name);
  for (const message of params.messages) {
    for (const call of message.toolCalls ?? []) names.add(call.function.name);
    if (message.name) names.add(message.name);
  }
  return names;
}

/** 已合法的名字优先保留原样，避免与转义后的名字互换导致还原歧义 */
function isWireSafe(name: string): boolean {
  return !WIRE_UNSAFE_CHAR.test(name) && name.length > 0 && name.length <= WIRE_NAME_MAX;
}

function assignWireName(original: string, used: Set<string>): string {
  const base = original.replace(WIRE_UNSAFE_ALL, '_').slice(0, WIRE_NAME_MAX);
  let candidate = base;
  let seq = 2;
  while (used.has(candidate)) {
    const suffix = `_${seq}`;
    candidate = `${base.slice(0, WIRE_NAME_MAX - suffix.length)}${suffix}`;
    seq += 1;
  }
  used.add(candidate);
  return candidate;
}

export function createWireToolNameCodec(params: ChatParams): WireToolNameCodec {
  const originals = [...collectToolNames(params)];
  const wireByOriginal = new Map<string, string>();
  const used = new Set<string>();

  for (const name of originals) {
    if (isWireSafe(name)) {
      used.add(name);
      wireByOriginal.set(name, name);
    }
  }
  for (const name of originals) {
    if (!wireByOriginal.has(name)) {
      wireByOriginal.set(name, assignWireName(name, used));
    }
  }

  const originalByWire = new Map(
    [...wireByOriginal].map(([original, wire]) => [wire, original]),
  );
  return {
    toWire: (name) => wireByOriginal.get(name) ?? name,
    toOriginal: (name) => originalByWire.get(name) ?? name,
  };
}

/** 线上消息里的函数名统一走 codec（声明与消息两处都可能是限定名） */
export function mapMessageToolNames(
  message: ChatMessage,
  codec: WireToolNameCodec,
): ChatMessage {
  return {
    ...message,
    ...(message.toolCalls
      ? {
          toolCalls: message.toolCalls.map((call) => ({
            ...call,
            function: { ...call.function, name: codec.toWire(call.function.name) },
          })),
        }
      : {}),
    ...(message.name ? { name: codec.toWire(message.name) } : {}),
  };
}
