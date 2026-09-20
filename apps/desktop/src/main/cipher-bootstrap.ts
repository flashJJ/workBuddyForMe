/**
 * 生成注入 standalone Node 服务的 --require 引导脚本。
 *
 * SecretCipher 是同步接口（core 服务层直接调用），而 safeStorage 只能在
 * Electron 主进程执行。这里在子进程内开一个 worker 发 HTTP，请求线程用
 * Atomics.wait 同步等待，从而得到同步加解密语义。
 *
 * 共享内存布局（cmd / resp 各一块）：
 *   [0..3]  Int32 ready（cmd: 1=encrypt/2=decrypt；resp: 1=完成）
 *   [4..7]  Int32 payload 字节长度
 *   [8..]   UTF-8 载荷
 */
export const PAYLOAD_CAPACITY = 16_384;

export interface CipherBootstrapParams {
  url: string;
  token: string;
}

export function renderCipherBootstrap(params: CipherBootstrapParams): string {
  const url = JSON.stringify(params.url);
  const token = JSON.stringify(params.token);
  return `'use strict';
/* 由 @wbfm/desktop 自动生成：safeStorage 同步桥，请勿手改 */
(function () {
  if (globalThis.__WBFM_CIPHER__) return;
  var worker_threads = require('node:worker_threads');
  var Worker = worker_threads.Worker;
  var CAP = ${PAYLOAD_CAPACITY};
  var cmd = new SharedArrayBuffer(8 + CAP);
  var resp = new SharedArrayBuffer(8 + CAP);
  var cmdView = new Int32Array(cmd, 0, 2);
  var cmdBytes = new Uint8Array(cmd, 8);
  var respView = new Int32Array(resp, 0, 2);
  var respBytes = new Uint8Array(resp, 8);

  var workerSource = [
    "const { parentPort, workerData } = require('node:worker_threads');",
    "const cmdView = new Int32Array(workerData.cmd, 0, 2);",
    "const cmdBytes = new Uint8Array(workerData.cmd, 8);",
    "const respView = new Int32Array(workerData.resp, 0, 2);",
    "const respBytes = new Uint8Array(workerData.resp, 8);",
    "for (;;) {",
    "  Atomics.wait(cmdView, 0, 0);",
    "  const op = Atomics.load(cmdView, 0);",
    "  const len = Atomics.load(cmdView, 1);",
    "  const text = Buffer.from(cmdBytes.slice(0, len)).toString('utf8');",
    "  const path = op === 1 ? '/encrypt' : '/decrypt';",
    "  fetch(workerData.url + path, {",
    "    method: 'POST',",
    "    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + workerData.token },",
    "    body: JSON.stringify({ value: text }),",
    "  }).then(function (r) {",
    "    if (!r.ok) throw new Error('cipher http ' + r.status);",
    "    return r.json();",
    "  }).then(function (data) {",
    "    const out = Buffer.from(String(data.value), 'utf8');",
    "    respBytes.set(out.slice(0, workerData.cap));",
    "    Atomics.store(respView, 1, out.length);",
    "    Atomics.store(respView, 0, 1);",
    "    Atomics.notify(respView, 0);",
    "  }).catch(function (err) {",
    "    const msg = Buffer.from(String(err && err.message || err), 'utf8');",
    "    respBytes.set(msg.slice(0, workerData.cap - 1), 1);",
    "    Atomics.store(respView, 1, -msg.length);",
    "    Atomics.store(respView, 0, 1);",
    "    Atomics.notify(respView, 0);",
    "  });",
    "  Atomics.store(cmdView, 0, 0);",
    "}",
  ].join('\\n');

  var worker = new Worker(workerSource, {
    eval: true,
    workerData: { url: ${url}, token: ${token}, cmd: cmd, resp: resp, cap: CAP },
  });
  worker.unref();

  function call(op, text) {
    var encoded = Buffer.from(String(text), 'utf8');
    if (encoded.length > CAP) throw new Error('cipher payload too large');
    Atomics.store(respView, 0, 0);
    cmdBytes.set(encoded, 0);
    Atomics.store(cmdView, 1, encoded.length);
    Atomics.store(cmdView, 0, op);
    Atomics.notify(cmdView, 0);
    var waited = Atomics.wait(respView, 0, 0, 10000);
    if (waited === 'timed-out') throw new Error('cipher request timed out');
    var outLen = Atomics.load(respView, 1);
    if (outLen < 0) {
      var msgLen = -outLen;
      throw new Error(Buffer.from(respBytes.slice(1, 1 + msgLen)).toString('utf8'));
    }
    return Buffer.from(respBytes.slice(0, outLen)).toString('utf8');
  }

  globalThis.__WBFM_CIPHER__ = {
    encrypt: function (plaintext) { return call(1, plaintext); },
    decrypt: function (ciphertext) { return call(2, ciphertext); },
  };
})();
`;
}
