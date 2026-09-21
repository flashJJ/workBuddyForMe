/**
 * LangSmith 可选链路追踪（直接 HTTP，不依赖 SDK 的 batch/retry 层）。
 * - 启用条件：LANGSMITH_TRACING=true（兼容 LANGCHAIN_TRACING_V2）且配置 API Key；
 * - 未启用时零成本直通：无网络请求、无动态导入；
 * - 追踪自身的任何异常都被吞掉，绝不影响对话主链路。
 */

export type TraceRunType = 'chain' | 'llm' | 'tool' | 'retriever' | 'embedding';

export interface TraceStartInput {
  name: string;
  runType: TraceRunType;
  inputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** 父 span（startRun/traceAsync 返回的不透明句柄），省略即为顶层 trace */
  parent?: TraceHandle | null;
}

export interface TraceHandle {
  /** 结束 span；outputs 与 error 二选一，error 会被归一为字符串 */
  end(outputs?: Record<string, unknown>, error?: unknown): Promise<void>;
}

/** 追踪开关：每次读取，环境变量变更无需重启进程即可生效 */
export function isTracingEnabled(): boolean {
  const on = process.env.LANGSMITH_TRACING ?? process.env.LANGCHAIN_TRACING_V2;
  const key = process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY;
  return on === 'true' && Boolean(key);
}

const DEFAULT_ENDPOINT = 'https://api.smith.langchain.com';

function getEndpoint(): string {
  return process.env.LANGSMITH_ENDPOINT ?? process.env.LANGCHAIN_ENDPOINT ?? DEFAULT_ENDPOINT;
}

function getApiKey(): string {
  return process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY ?? '';
}

function getProjectName(): string {
  return process.env.LANGSMITH_PROJECT ?? process.env.LANGCHAIN_PROJECT ?? 'default';
}

function toErrorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** 生成 UUID v7（时间序） */
function uuidV7(): string {
  const ms = Date.now();
  const msHex = ms.toString(16).padStart(12, '0');
  const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  rand[6] = (rand[6]! & 0x0f) | 0x70;
  rand[8] = (rand[8]! & 0x3f) | 0x80;
  const hex = [msHex.slice(0, 8), msHex.slice(8, 12),
    ...rand.slice(6).map((b) => b.toString(16).padStart(2, '0'))].join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * LangSmith dotted_order 格式（与 SDK 的 convertToDottedOrderFormat 一致）：
 * YYYYMMDDTHHMMSSmmmoooZ + runId（无连字符）
 * mmm=毫秒3位，ooo=执行序3位
 */
function dottedOrder(epoch: number, runId: string, execOrder: number): string {
  const iso = new Date(epoch).toISOString().slice(0, -1);
  const paddedOrder = execOrder.toString().slice(0, 3).padStart(3, '0');
  return `${iso}${paddedOrder}Z`.replace(/[-:.]/g, '') + runId.replace(/-/g, '');
}

/** 递增的执行序号，保证同一毫秒内的子 span 顺序 */
let globalExecOrder = 0;

interface SpanData {
  id: string;
  traceId: string;
  order: string;
  parentId: string | null;
  name: string;
}

class DirectTrace implements TraceHandle {
  private constructor(private readonly span: SpanData) {}

  static async start(input: TraceStartInput, parent: DirectTrace | null): Promise<TraceHandle | null> {
    if (!isTracingEnabled()) return null;
    globalExecOrder += 1;
    const id = uuidV7();
    const traceId = parent?.span.traceId ?? id;
    const order = parent
      ? `${parent.span.order}.${dottedOrder(Date.now(), id, globalExecOrder)}`
      : dottedOrder(Date.now(), id, globalExecOrder);
    const parentId = parent?.span.id ?? null;

    const body = {
      id,
      name: input.name,
      run_type: input.runType,
      inputs: input.inputs ?? {},
      ...(input.metadata ? { extra: { metadata: input.metadata } } : {}),
      start_time: Date.now(),
      trace_id: traceId,
      dotted_order: order,
      parent_run_id: parentId,
      session_name: getProjectName(),
    };

    await postRun(`${getEndpoint()}/runs`, body);
    return new DirectTrace({ id, traceId, order, parentId, name: input.name });
  }

  async end(outputs?: Record<string, unknown>, error?: unknown): Promise<void> {
    const body = {
      id: this.span.id,
      outputs: outputs ?? {},
      ...(error ? { error: toErrorText(error) } : {}),
      end_time: Date.now(),
      trace_id: this.span.traceId,
      dotted_order: this.span.order,
      parent_run_id: this.span.parentId,
      session_name: getProjectName(),
    };
    await postRun(`${getEndpoint()}/runs/${this.span.id}`, body);
  }
}

async function postRun(url: string, body: unknown): Promise<void> {
  try {
    const resp = await fetch(url, {
      method: url.includes('/runs/') ? 'PATCH' : 'POST',
      headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[tracer] ${url.slice(-20)} ${resp.status}`);
    }
  } catch {
    // 静默吞掉追踪网络异常
  }
}

/** 开启一个 span；未启用或初始化失败时返回 null */
export async function startRun(input: TraceStartInput): Promise<TraceHandle | null> {
  const parent = input.parent instanceof DirectTrace ? input.parent : null;
  return DirectTrace.start(input, parent);
}

/**
 * 包裹一个 Promise：成功时记录 outputs，抛错时记录 error 并原样抛出。
 * mapOutput 用于把结果裁剪成可序列化、体积可控的 trace 输出。
 */
export async function traceAsync<T>(
  input: TraceStartInput,
  fn: () => Promise<T>,
  mapOutput?: (value: T) => Record<string, unknown> | undefined,
): Promise<T> {
  const handle = await startRun(input);
  if (!handle) return fn();
  try {
    const value = await fn();
    await handle.end(mapOutput ? mapOutput(value) : undefined);
    return value;
  } catch (error) {
    await handle.end(undefined, error);
    throw error;
  }
}
