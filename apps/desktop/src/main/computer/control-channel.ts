import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  screenSnapshotArgsSchema,
  type ComputerChannelInfo,
  type ScreenSnapshotArgs,
  type ScreenSnapshotResponse,
} from '@wbfm/shared';

export interface ComputerChannelHandlers {
  snapshot(args: ScreenSnapshotArgs): Promise<ScreenSnapshotResponse>;
}

export interface ComputerChannel {
  /** 形如 http://127.0.0.1:53122，仅本机回环可达 */
  url: string;
  token: string;
  close(): Promise<void>;
}

/**
 * v0.7 M1 桌面能力控制通道：
 * web server（fork 子进程 / dev server）经此通道调用主进程的桌面能力。
 * 仅监听 127.0.0.1 + 随机 bearer token；发现文件落在数据根目录
 * （core 侧 resolveDataPath(COMPUTER_CHANNEL_FILE) 读取），权限 0600。
 */
export function startComputerChannel(options: {
  token?: string;
  handlers: ComputerChannelHandlers;
}): Promise<ComputerChannel> {
  const token = options.token ?? randomBytes(24).toString('hex');
  const server = http.createServer((req, res) => {
    if (!authorized(req, token)) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method !== 'POST' || req.url !== '/screen/snapshot') {
      return sendJson(res, 404, { error: 'not_found' });
    }
    readJson(req)
      .then((body) => {
        const parsed = screenSnapshotArgsSchema.safeParse(body);
        if (!parsed.success) {
          return sendJson(res, 422, { error: 'invalid_args', detail: parsed.error.issues[0]?.message });
        }
        return options.handlers
          .snapshot(parsed.data)
          .then((snapshot) => sendJson(res, 200, snapshot))
          .catch((error: unknown) => {
            console.error('[wbfm] 屏幕截图失败:', error);
            sendJson(res, 500, { error: 'snapshot_failed' });
          });
      })
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
