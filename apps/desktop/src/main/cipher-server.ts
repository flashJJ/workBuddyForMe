import http from 'node:http';
import { safeStorage } from 'electron';

export interface CipherEndpoint {
  /** 形如 http://127.0.0.1:53122，仅本机回环可达 */
  url: string;
  token: string;
  close(): Promise<void>;
}

/**
 * safeStorage 本地回环桥：
 * 加解密只能在 Electron 主进程执行，fork 出的 standalone Node 服务
 * 通过一次性 bearer token 访问 /encrypt、/decrypt（bootstrap worker 同步调用）。
 */
export function startCipherServer(token: string): Promise<CipherEndpoint> {
  const server = http.createServer((req, res) => {
    if (!authorized(req, token)) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method !== 'POST' || (req.url !== '/encrypt' && req.url !== '/decrypt')) {
      return sendJson(res, 404, { error: 'not_found' });
    }
    readJson<{ value?: string }>(req)
      .then((body) => {
        if (typeof body.value !== 'string') return sendJson(res, 422, { error: 'invalid_body' });
        const result = req.url === '/encrypt' ? safeStorage.encryptString(body.value) : safeStorage.decryptString(Buffer.from(body.value, 'base64'));
        const encoded = req.url === '/encrypt' ? result.toString('base64') : result;
        sendJson(res, 200, { value: encoded });
      })
      .catch(() => sendJson(res, 500, { error: 'cipher_failed' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('cipher server 绑定失败'));
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

function readJson<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
