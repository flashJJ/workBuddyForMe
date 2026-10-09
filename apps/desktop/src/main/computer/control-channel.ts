import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  appLaunchArgsSchema,
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
  type MousePositionResponse,
  type MouseScrollArgs,
  type ScreenSnapshotArgs,
  type ScreenSnapshotResponse,
  type UiaListArgs,
  type UiaListResponse,
  type WindowFocusArgs,
  type WindowListResponse,
} from '@wbfm/shared/schemas';
import type { z } from 'zod';

/**
 * 控制通道处理器：每个路由一个 handler，缺省（undefined）表示该能力不可用 → 404。
 * 桌面端主进程实现全部；测试可只注入需要的子集。
 */
export interface ComputerChannelHandlers {
  snapshot(args: ScreenSnapshotArgs): Promise<ScreenSnapshotResponse>;
  mouseMove?(args: MouseMoveArgs): Promise<InputActionResponse>;
  mouseClick?(args: MouseClickArgs): Promise<InputActionResponse>;
  mouseScroll?(args: MouseScrollArgs): Promise<InputActionResponse>;
  mousePosition?(): Promise<MousePositionResponse>;
  keyboardType?(args: KeyboardTypeArgs): Promise<InputActionResponse>;
  keyboardPress?(args: KeyboardPressArgs): Promise<InputActionResponse>;
  windowList?(): Promise<WindowListResponse>;
  windowFocus?(args: WindowFocusArgs): Promise<InputActionResponse>;
  appLaunch?(args: AppLaunchArgs): Promise<InputActionResponse>;
  uiaList?(args: UiaListArgs): Promise<UiaListResponse>;
}

export interface ComputerChannel {
  /** 形如 http://127.0.0.1:53122，仅本机回环可达 */
  url: string;
  token: string;
  close(): Promise<void>;
}

interface Route {
  path: string;
  /** 请求体 schema；无体路由（如 mousePosition）传 null */
  schema: z.ZodTypeAny | null;
  invoke(handlers: ComputerChannelHandlers, args: unknown): Promise<unknown> | undefined;
}

const ROUTES: Route[] = [
  {
    path: '/screen/snapshot',
    schema: screenSnapshotArgsSchema,
    invoke: (h, a) => h.snapshot(a as ScreenSnapshotArgs),
  },
  {
    path: '/input/mouse-move',
    schema: mouseMoveArgsSchema,
    invoke: (h, a) => h.mouseMove?.(a as MouseMoveArgs),
  },
  {
    path: '/input/mouse-click',
    schema: mouseClickArgsSchema,
    invoke: (h, a) => h.mouseClick?.(a as MouseClickArgs),
  },
  {
    path: '/input/mouse-scroll',
    schema: mouseScrollArgsSchema,
    invoke: (h, a) => h.mouseScroll?.(a as MouseScrollArgs),
  },
  {
    path: '/input/mouse-position',
    schema: null,
    invoke: (h) => h.mousePosition?.(),
  },
  {
    path: '/input/keyboard-type',
    schema: keyboardTypeArgsSchema,
    invoke: (h, a) => h.keyboardType?.(a as KeyboardTypeArgs),
  },
  {
    path: '/input/keyboard-press',
    schema: keyboardPressArgsSchema,
    invoke: (h, a) => h.keyboardPress?.(a as KeyboardPressArgs),
  },
  {
    path: '/windows/list',
    schema: null,
    invoke: (h) => h.windowList?.(),
  },
  {
    path: '/windows/focus',
    schema: windowFocusArgsSchema,
    invoke: (h, a) => h.windowFocus?.(a as WindowFocusArgs),
  },
  {
    path: '/app/launch',
    schema: appLaunchArgsSchema,
    invoke: (h, a) => h.appLaunch?.(a as AppLaunchArgs),
  },
  {
    path: '/uia/list',
    schema: uiaListArgsSchema,
    invoke: (h, a) => h.uiaList?.(a as UiaListArgs),
  },
];

/**
 * v0.7 桌面能力控制通道：web server（fork 子进程 / dev server）经此通道调用主进程桌面能力。
 * 仅监听 127.0.0.1 + 随机 bearer token；发现文件落在数据根目录（权限 0600）。
 */
export function startComputerChannel(options: {
  token?: string;
  handlers: ComputerChannelHandlers;
}): Promise<ComputerChannel> {
  const token = options.token ?? randomBytes(24).toString('hex');
  const server = http.createServer((req, res) => {
    if (!authorized(req, token)) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method !== 'POST') return sendJson(res, 404, { error: 'not_found' });
    const route = ROUTES.find((r) => r.path === req.url);
    if (!route) return sendJson(res, 404, { error: 'not_found' });

    readJson(req)
      .then((body) => dispatch(route, options.handlers, body, res))
      .catch(() => sendJson(res, 422, { error: 'invalid_body' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('控制通道绑定失败'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        token,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

async function dispatch(
  route: Route,
  handlers: ComputerChannelHandlers,
  body: unknown,
  res: http.ServerResponse,
): Promise<void> {
  const invoke = route.invoke;
  // 能力缺失（handler 未注入）同样按 404 处理，但先校验参数便于客户端排错
  let args: unknown = body ?? {};
  if (route.schema) {
    const parsed = route.schema.safeParse(args);
    if (!parsed.success) {
      return sendJson(res, 422, { error: 'invalid_args', detail: parsed.error.issues[0]?.message });
    }
    args = parsed.data;
  }
  try {
    const result = await invoke(handlers, args);
    if (result === undefined) return sendJson(res, 404, { error: 'capability_unavailable' });
    sendJson(res, 200, result);
  } catch (error) {
    console.error(`[wbfm] 控制通道 ${route.path} 执行失败:`, error);
    sendJson(res, 500, { error: 'action_failed' });
  }
}

/** 写通道发现文件（0600），供 web server 侧定位通道 */
export function writeChannelDiscovery(filePath: string, info: ComputerChannelInfo): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(info, null, 2), { mode: 0o600 });
}

/** 退出时移除发现文件（不存在则忽略），避免残留过期 token 被误用 */
export function removeChannelDiscovery(filePath: string): void {
  try {
    fs.rmSync(filePath);
  } catch {
    // 文件不存在：正常退出路径无需处理
  }
}

function authorized(req: http.IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  return typeof header === 'string' && header === `Bearer ${token}`;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
