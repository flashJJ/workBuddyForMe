/**
 * 生成注入 standalone Node 服务的 --require 引导脚本。
 *
 * SecretCipher 是同步接口（core 服务层直接调用），而 safeStorage 只能在
 * Electron 主进程执行。架构：
 * - 常驻 worker 以 **message 事件驱动**（parentPort.on），其事件循环保持自由，
 *   fetch 的 DNS/TCP/响应回调才能正常推进；
 * - 每次调用独立分配一块响应 SAB 并 postMessage 下发，请求线程用 Atomics.wait
 *   同步等待，从而得到同步加解密语义；
 * - 每请求独立 SAB 天然隔离迟到响应：超时后重试只是换新 SAB，旧响应写入无人
 *   读取的旧缓冲，绝不污染下一次调用。
 *
 * 冷启动容错（v1.1.1 真机抽测修复）：Electron 主进程在窗口/桌宠恢复/控制通道
 * 初始化窗口内事件循环繁忙，对端桥响应可能慢。单次 fetch 8s 超时，调用方在
 * 30s 总预算内最多尝试 3 次，覆盖整个启动繁忙窗口。
 *
 * 历史教训：旧实现让 worker 在 Atomics.wait 命令循环里发 fetch——wait 会冻结
 * worker 自身事件循环，undici I/O 永不完成（纯 Node 22/24 下必现死锁）。dev 态
 * 不走桥、打包 smoke 用空数据根无需解密，故长期未暴露，直到真机打开供应商列表。
 *
 * 每块响应 SAB 布局：
 *   [0..3]  Int32 状态（0=等待/1=完成）
 *   [4..7]  Int32 载荷字节长度（负值=错误消息长度，错误文本从偏移 1 起写）
 *   [8..]   UTF-8 载荷
 */
export const PAYLOAD_CAPACITY = 16_384;

/** 单次 fetch 超时（毫秒） */
export const CIPHER_FETCH_TIMEOUT_MS = 8_000;
/** 总尝试次数（含首次） */
export const CIPHER_MAX_ATTEMPTS = 3;
/** 调用方总等待预算（毫秒）；须 ≥ MAX_ATTEMPTS × FETCH_TIMEOUT */
export const CIPHER_TOTAL_DEADLINE_MS = 30_000;

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
  // 生产默认值；仅单测通过 WBFM_CIPHER_TEST_* 压短时序
  var FETCH_TIMEOUT_MS = Number(process.env.WBFM_CIPHER_TEST_FETCH_TIMEOUT_MS) || ${CIPHER_FETCH_TIMEOUT_MS};
  var MAX_ATTEMPTS = Number(process.env.WBFM_CIPHER_TEST_MAX_ATTEMPTS) || ${CIPHER_MAX_ATTEMPTS};
  var TOTAL_DEADLINE_MS = Number(process.env.WBFM_CIPHER_TEST_DEADLINE_MS) || ${CIPHER_TOTAL_DEADLINE_MS};

  // worker 必须保持事件循环自由：message 到达后异步 fetch，绝不在此线程 Atomics.wait
  var workerSource = [
    "const { parentPort, workerData } = require('node:worker_threads');",
    "parentPort.on('message', function (cmd) {",
    "  const view = new Int32Array(cmd.resp, 0, 2);",
    "  const bytes = new Uint8Array(cmd.resp, 8);",
    "  const finish = function (ok, payload) {",
    "    const buf = Buffer.from(String(payload), 'utf8');",
    "    if (ok) bytes.set(buf.slice(0, workerData.cap), 0);",
    "    else bytes.set(buf.slice(0, workerData.cap - 1), 1);",
    "    Atomics.store(view, 1, ok ? buf.length : -buf.length);",
    "    Atomics.store(view, 0, 1);",
    "    Atomics.notify(view, 0);",
    "  };",
    "  (async function () {",
    "    try {",
    "      const r = await fetch(workerData.url + (cmd.op === 1 ? '/encrypt' : '/decrypt'), {",
    "        method: 'POST',",
    "        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + workerData.token },",
    "        body: JSON.stringify({ value: cmd.text }),",
    "        signal: AbortSignal.timeout(workerData.fetchTimeoutMs),",
    "      });",
    "      if (!r.ok) throw new Error('cipher http ' + r.status);",
    "      const data = await r.json();",
    "      finish(true, data.value);",
    "    } catch (err) {",
    "      finish(false, String(err && err.message || err));",
    "    }",
    "  })();",
    "});",
  ].join('\\n');

  var worker = new Worker(workerSource, {
    eval: true,
    workerData: {
      url: ${url},
      token: ${token},
      cap: CAP,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
    },
  });
  worker.unref();
  worker.on('error', function (err) {
    // worker 崩溃必须可见：否则调用方只会得到空等超时
    console.error('[cipher-worker]', err && err.stack || err);
  });

  function call(op, text) {
    var payload = String(text);
    if (Buffer.byteLength(payload, 'utf8') > CAP) throw new Error('cipher payload too large');
    var deadline = Date.now() + TOTAL_DEADLINE_MS;
    var lastError = 'cipher unavailable';
    for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // 每尝试独立 SAB：迟到响应只写旧缓冲，与本轮物理隔离
      var resp = new SharedArrayBuffer(8 + CAP);
      var view = new Int32Array(resp, 0, 2);
      worker.postMessage({ op: op, text: payload, resp: resp });

      var remain = deadline - Date.now();
      if (remain <= 0) break;
      Atomics.wait(view, 0, 0, Math.min(FETCH_TIMEOUT_MS + 500, remain));
      if (view[0] === 1) {
        var len = Atomics.load(view, 1);
        if (len >= 0) {
          return Buffer.from(new Uint8Array(resp, 8).slice(0, len)).toString('utf8');
        }
        lastError = Buffer.from(new Uint8Array(resp, 8).slice(1, 1 - len)).toString('utf8');
      }
      // view[0]===0：本轮超时（对端忙/无响应），换新 SAB 再试
    }
    throw new Error(lastError);
  }

  globalThis.__WBFM_CIPHER__ = {
    // 加密失败必须抛（保存密钥要让调用方感知）
    encrypt: function (plaintext) { return call(1, plaintext); },
    // 遵循 SecretCipher 契约：解密失败（桥不可用/密文跨密钥体系/损坏）返回 null，
    // 由服务层统一降级为「未配置密钥」，绝不允许拖垮列表/启动接口
    decrypt: function (ciphertext) {
      try {
        return call(2, ciphertext);
      } catch (error) {
        console.error('[cipher] 解密失败，按未配置密钥降级：', error instanceof Error ? error.message : error);
        return null;
      }
    },
  };
})();
`;
}
