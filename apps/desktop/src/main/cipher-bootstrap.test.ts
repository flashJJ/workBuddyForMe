import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  CIPHER_FETCH_TIMEOUT_MS,
  CIPHER_MAX_ATTEMPTS,
  CIPHER_TOTAL_DEADLINE_MS,
  renderCipherBootstrap,
} from './cipher-bootstrap';

describe('renderCipherBootstrap 引导脚本', () => {
  it('暴露同步 __WBFM_CIPHER__，内含 worker/Atomics 与端点配置', () => {
    const source = renderCipherBootstrap({ url: 'http://127.0.0.1:53000', token: 'abc123' });
    expect(source).toContain('globalThis.__WBFM_CIPHER__');
    expect(source).toContain('encrypt:');
    expect(source).toContain('decrypt:');
    expect(source).toContain("require('node:worker_threads')");
    expect(source).toContain('Atomics.wait');
    expect(source).toContain('/encrypt');
    expect(source).toContain('/decrypt');
    expect(source).toContain('http://127.0.0.1:53000');
    expect(source).toContain('abc123');
  });

  it('消息驱动 worker：parentPort.on 异步 fetch，绝不在 worker 线程 Atomics.wait', () => {
    const source = renderCipherBootstrap({ url: 'http://127.0.0.1:1', token: 't' });
    expect(source).toContain("parentPort.on('message'");
    expect(source).toContain('worker.postMessage({ op: op');
    // worker 源里不得出现 Atomics（否则会冻结其事件循环、undici I/O 死锁）
    const workerBody = source.slice(source.indexOf('var workerSource'), source.indexOf("].join"));
    expect(workerBody).not.toContain('Atomics.wait');
    expect(workerBody).toContain('AbortSignal.timeout');
  });

  it('冷启动容错：3 次尝试、单次 8s、总预算 30s，独立 SAB 隔离迟到响应', () => {
    expect(CIPHER_FETCH_TIMEOUT_MS).toBe(8_000);
    expect(CIPHER_MAX_ATTEMPTS).toBe(3);
    expect(CIPHER_TOTAL_DEADLINE_MS).toBe(30_000);
    const source = renderCipherBootstrap({ url: 'http://127.0.0.1:1', token: 't' });
    expect(source).toContain('attempt <= MAX_ATTEMPTS');
    expect(source).toContain('new SharedArrayBuffer(8 + CAP)');
    // decrypt 遵循 SecretCipher 契约：失败返回 null，不允许抛错拖垮调用方
    expect(source).toContain('解密失败，按未配置密钥降级');
  });
});

/**
 * mock cipher 桥跑在独立 worker 线程：生产拓扑中 cipher server 在 Electron
 * 主进程、bootstrap 在 fork 出的 standalone server 进程——必须跨事件循环隔离。
 * 若同线程起 server，调用方 Atomics.wait 会把自己的 mock server 一起冻结
 * （TCP 可握手但请求处理被挂起，曾在本测试中以"超时"假象误导排查）。
 */
const MOCK_BRIDGE_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const http = require('node:http');
let flaky = 0;
let slow = 0;
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer ' + workerData.token) { res.writeHead(401).end(); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const send = (status, payload) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/encrypt') {
      if (body.value === 'flaky') { flaky += 1; if (flaky <= 2) return send(502, { error: 'cold' }); return send(200, { value: 'ENC-FLAKY' }); }
      if (body.value === 'slow') {
        slow += 1;
        // 首次响应晚于调用侧单次 fetch 超时（300ms），被 abort 后下一轮重试
        if (slow === 1) { setTimeout(() => send(200, { value: 'LATE' }), 700); return; }
        return send(200, { value: 'ENC-SLOW' });
      }
      if (body.value === 'bad') return send(502, { error: 'always' });
      return send(200, { value: 'ENC:' + body.value });
    }
    if (body.value === 'badcipher') return send(502, { error: 'always' });
    send(200, { value: 'PLAIN:' + body.value });
  });
});
server.listen(0, '127.0.0.1', () => parentPort.postMessage('http://127.0.0.1:' + server.address().port));
`;

describe('cipher bootstrap 真实 worker 桥接（跨线程 mock 桥）', () => {
  const TOKEN = 'test-token-xyz';

  interface CipherBridge {
    encrypt(text: string): string;
    decrypt(text: string): string;
  }

  let bridgeWorker: Worker;
  let cipher: CipherBridge;
  let tmpDir: string;

  beforeAll(async () => {
    process.env.WBFM_CIPHER_TEST_FETCH_TIMEOUT_MS = '300';
    process.env.WBFM_CIPHER_TEST_MAX_ATTEMPTS = '3';
    process.env.WBFM_CIPHER_TEST_DEADLINE_MS = '5000';

    bridgeWorker = new Worker(MOCK_BRIDGE_SOURCE, { eval: true, workerData: { token: TOKEN } });
    const baseUrl = await new Promise<string>((resolve) =>
      bridgeWorker.once('message', (url: string) => resolve(url)),
    );

    tmpDir = mkdtempSync(join(tmpdir(), 'wbfm-cipher-bootstrap-'));
    const bootstrapPath = join(tmpDir, 'cipher-bootstrap.cjs');
    writeFileSync(bootstrapPath, renderCipherBootstrap({ url: baseUrl, token: TOKEN }), 'utf8');
    const require = createRequire(import.meta.url);
    require(bootstrapPath);
    cipher = (globalThis as { __WBFM_CIPHER__?: CipherBridge }).__WBFM_CIPHER__!;
  }, 30_000);

  afterAll(async () => {
    await bridgeWorker.terminate();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.WBFM_CIPHER_TEST_FETCH_TIMEOUT_MS;
    delete process.env.WBFM_CIPHER_TEST_MAX_ATTEMPTS;
    delete process.env.WBFM_CIPHER_TEST_DEADLINE_MS;
  });

  it('加解密正常往返', () => {
    expect(cipher.encrypt('hello')).toBe('ENC:hello');
    expect(cipher.decrypt('Y2lwaGVydGV4dA==')).toBe('PLAIN:Y2lwaGVydGV4dA==');
  });

  it('冷启动 5xx：前两次失败、第三次成功（重试对调用方透明）', () => {
    expect(cipher.encrypt('flaky')).toBe('ENC-FLAKY');
  });

  it('冷启动慢响应：首轮 fetch 超时 abort，下一轮成功且不采纳迟到响应', () => {
    const started = Date.now();
    expect(cipher.encrypt('slow')).toBe('ENC-SLOW');
    // 必然经历过一次 300ms 超时等待，且总预算内成功（迟到的 LATE 写入已放弃的旧 SAB）
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  it('持续 5xx：encrypt 重试耗尽后抛出（保存密钥必须感知失败）', () => {
    expect(() => cipher.encrypt('bad')).toThrow(/cipher http 502/);
  });

  it('decrypt 重试耗尽后返回 null（SecretCipher 契约：降级为未配置密钥，不抛）', () => {
    expect(cipher.decrypt('badcipher')).toBeNull();
  });
});
