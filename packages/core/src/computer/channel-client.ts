import fs from 'node:fs';
import { resolveDataPath } from '@wbfm/config';
import {
  COMPUTER_CHANNEL_FILE,
  appLaunchArgsSchema,
  computerChannelInfoSchema,
  keyboardPressArgsSchema,
  keyboardTypeArgsSchema,
  mouseClickArgsSchema,
  mouseMoveArgsSchema,
  mouseScrollArgsSchema,
  screenSnapshotArgsSchema,
  uiaListArgsSchema,
  windowFocusArgsSchema,
  type AppLaunchArgs,
  type ComputerChannelInfo,
  type InputActionResponse,
  type KeyboardPressArgs,
  type KeyboardTypeArgs,
  type MouseClickArgs,
  type MouseMoveArgs,
  type MouseScrollArgs,
  type ScreenSnapshotArgs,
  type ScreenSnapshotResponse,
  type UiaListArgs,
  type UiaListResponse,
  type WindowFocusArgs,
  type WindowListResponse,
} from '@wbfm/shared';
import type { ZodType } from 'zod';

/** 桌面端控制通道不可用（纯 Web 模式 / 通道未就绪 / 请求失败） */
export class ChannelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelUnavailableError';
  }
}

export interface ComputerChannelClient {
  /** 读发现文件；文件缺失/损坏/契约不符一律返回 null（视为纯 Web 模式） */
  getInfo(): ComputerChannelInfo | null;
  /** 调用屏幕截图；通道缺失或请求失败抛 ChannelUnavailableError */
  snapshot(args: ScreenSnapshotArgs, signal?: AbortSignal): Promise<ScreenSnapshotResponse>;
  mouseMove(args: MouseMoveArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  mouseClick(args: MouseClickArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  mouseScroll(args: MouseScrollArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  keyboardType(args: KeyboardTypeArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  keyboardPress(args: KeyboardPressArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  windowList(signal?: AbortSignal): Promise<WindowListResponse>;
  windowFocus(args: WindowFocusArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  appLaunch(args: AppLaunchArgs, signal?: AbortSignal): Promise<InputActionResponse>;
  uiaList(args: UiaListArgs, signal?: AbortSignal): Promise<UiaListResponse>;
}

export interface ComputerChannelClientOptions {
  /** 测试注入：发现文件路径（默认 resolveDataPath(COMPUTER_CHANNEL_FILE)） */
  infoPath?: string;
  /** 测试注入：fetch 实现 */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function createComputerChannelClient(
  options: ComputerChannelClientOptions = {},
): ComputerChannelClient {
  const infoPath = options.infoPath ?? resolveDataPath(COMPUTER_CHANNEL_FILE);
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function getInfo(): ComputerChannelInfo | null {
    try {
      const raw = fs.readFileSync(infoPath, 'utf8');
      const parsed = computerChannelInfoSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async function post<T>(route: string, body: unknown, signal: AbortSignal | undefined, schema?: ZodType): Promise<T> {
    const info = getInfo();
    if (!info) {
      throw new ChannelUnavailableError('未检测到桌面端控制通道（发现文件缺失或无效）');
    }
    // fail-fast：发请求前先过参数 schema，非法参数不占用网络往返
    const payload = schema ? schema.parse(body ?? {}) : (body ?? {});
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await doFetch(`${info.url}${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${info.token}`,
        },
        body: JSON.stringify(payload),
        signal: combined,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ChannelUnavailableError(`控制通道请求失败：${detail}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ChannelUnavailableError(`控制通道返回 HTTP ${res.status}：${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  return {
    getInfo,
    snapshot: (args, signal) => post('/screen/snapshot', args, signal, screenSnapshotArgsSchema),
    mouseMove: (args, signal) => post('/input/mouse-move', args, signal, mouseMoveArgsSchema),
    mouseClick: (args, signal) => post('/input/mouse-click', args, signal, mouseClickArgsSchema),
    mouseScroll: (args, signal) => post('/input/mouse-scroll', args, signal, mouseScrollArgsSchema),
    keyboardType: (args, signal) => post('/input/keyboard-type', args, signal, keyboardTypeArgsSchema),
    keyboardPress: (args, signal) => post('/input/keyboard-press', args, signal, keyboardPressArgsSchema),
    windowList: (signal) => post('/windows/list', {}, signal),
    windowFocus: (args, signal) => post('/windows/focus', args, signal, windowFocusArgsSchema),
    appLaunch: (args, signal) => post('/app/launch', args, signal, appLaunchArgsSchema),
    uiaList: (args, signal) => post('/uia/list', args, signal, uiaListArgsSchema),
  };
}
