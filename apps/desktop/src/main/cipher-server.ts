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
 *
 * Electron 45 起同步 encryptString / decryptString 已弃用，这里统一走
 * encryptStringAsync / decryptStringAsync；Node 侧仍由 Atomics.wait 维持同步语义。
 */
export function startCipherServer(token: string): Promise<CipherEndpoint> {
  const server = http.createServer((req, res) => {
    void handleRequest(req, res, token).catch((error) => {
      console.error('[wbfm] cipher 请求失败:', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'cipher_failed' });
    });
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

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  token: string,
): Promise<void> {
  if (!authorized(req, token)) return sendJson(res, 401, { error: 'unauthorized' });
  if (req.method !== 'POST' || (req.url !== '/encrypt' && req.url !== '/decrypt')) {
    return sendJson(res, 404, { error: 'not_found' });
  }
  const body = await readJson<{ value?: string }>(req);
  if (typeof body.value !== 'string') return sendJson(res, 422, { error: 'invalid_body' });
  if (req.url === '/encrypt') {
    const encrypted = await safeStorage.encryptStringAsync(body.value);
    return sendJson(res, 200, { value: encrypted.toString('base64') });
  }
  // shouldReEncrypt 只提示系统密钥轮换；桥只返回明文，持久化由服务层下次保存时重加密。
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(body.value, 'base64'));
  return sendJson(res, 200, { value: decrypted.result });
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
