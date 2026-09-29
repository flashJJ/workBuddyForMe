import fs from 'node:fs';
import { resolveDataPath } from '@wbfm/config';
import {
  COMPUTER_CHANNEL_FILE,
  computerChannelInfoSchema,
  screenSnapshotArgsSchema,
  type ComputerChannelInfo,
  type ScreenSnapshotArgs,
  type ScreenSnapshotResponse,
} from '@wbfm/shared';

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

  async function snapshot(args: ScreenSnapshotArgs, signal?: AbortSignal): Promise<ScreenSnapshotResponse> {
    const info = getInfo();
    if (!info) {
      throw new ChannelUnavailableError('未检测到桌面端控制通道（发现文件缺失或无效）');
    }
    const parsedArgs = screenSnapshotArgsSchema.parse(args);
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await doFetch(`${info.url}/screen/snapshot`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${info.token}`,
        },
        body: JSON.stringify(parsedArgs),
        signal: combined,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ChannelUnavailableError(`控制通道请求失败：${detail}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ChannelUnavailableError(`控制通道返回 HTTP ${res.status}：${body.slice(0, 200)}`);
    }
    return (await res.json()) as ScreenSnapshotResponse;
  }

  return { getInfo, snapshot };
}
