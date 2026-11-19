#!/usr/bin/env node
/**
 * v4.11 P0：离线网页夹具服务（Fake Web）。
 *
 * 只提供验收需要的确定性响应，不访问外网：
 *   /simple             正常 HTML（标题 + 提纲）
 *   /large?chars=40000  长正文，用于 offset 续读与预算折叠
 *   /slow?ms=300        延迟响应，用于并发时序断言
 *   /redirect           两跳 302 → /simple，用于逐跳 SSRF 校验
 *   /json               application/json 响应
 *   /empty              空正文
 *   /404                HTTP 404
 *   /__stats            请求记录（含到达时间，用于判断是否并发）
 *   /__reset            清空请求记录（POST）
 *
 * 用法：node scripts/fixtures/web/server.mjs [--port=43101]
 */
import { createServer } from 'node:http';

const argv = process.argv.slice(2);
const portArg = argv.find((arg) => arg.startsWith('--port='))?.slice('--port='.length);
const PORT = Number(portArg ?? process.env.WBFM_FIXTURE_PORT ?? 43101);

/** @type {Array<{path:string, query:Record<string,string>, at:number}>} */
let requests = [];

const HEADINGS = [
  '检索预算',
  '并发抓取',
  '上下文折叠',
  '证据引用',
  '失败降级',
  '缓存续读',
  '性能基线',
  '回归策略',
];

function page(title, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
}

function outline() {
  return HEADINGS.map((heading, index) => `<h2>${index + 1}. ${heading}</h2>`).join('');
}

function filler(chars) {
  const unit =
    'When the model asks for many sources, the harness must fetch them concurrently, keep the newest result intact, and fold the older ones so the context window stays usable. ';
  const paragraphs = [];
  let total = 0;
  let index = 0;
  while (total < chars) {
    const heading = HEADINGS[index % HEADINGS.length];
    const block = `<h2>${index + 1}. ${heading}</h2><p>${unit.repeat(3)} 章节 ${index + 1} 记录：${'数据'.repeat(20)}</p>`;
    paragraphs.push(block);
    total += block.length;
    index += 1;
  }
  return paragraphs.join('');
}

function send(res, status, contentType, body, extra = {}) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-fixture': 'wbfm',
    ...extra,
  });
  res.end(body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());

  if (path === '/__stats') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ count: requests.length, requests }));
  }
  if (path === '/__reset') {
    requests = [];
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
  }

  requests.push({ path, query, at: Date.now() });

  if (path === '/simple') {
    return send(res, 200, 'text/html; charset=utf-8', page('简单页面', `${outline()}<p>你好世界，这是夹具页面的正文。</p>`));
  }
  if (path === '/large') {
    const chars = Math.min(Number(query.chars ?? 40_000) || 40_000, 200_000);
    return send(res, 200, 'text/html; charset=utf-8', page('长页面', filler(chars)));
  }
  if (path === '/slow') {
    const ms = Math.min(Number(query.ms ?? 300) || 300, 5_000);
    await sleep(ms);
    return send(res, 200, 'text/html; charset=utf-8', page('慢页面', `<p>延迟 ${ms}ms 后返回。</p>`));
  }
  if (path === '/redirect') {
    return send(res, 302, 'text/plain; charset=utf-8', '', { location: '/redirect-2' });
  }
  if (path === '/redirect-2') {
    return send(res, 302, 'text/plain; charset=utf-8', '', { location: '/simple' });
  }
  if (path === '/json') {
    return send(
      res,
      200,
      'application/json; charset=utf-8',
      JSON.stringify({ items: [{ id: 'a-1', status: 'ok' }, { id: 'b-2', status: 'ok' }] }),
    );
  }
  if (path === '/empty') {
    return send(res, 200, 'text/html; charset=utf-8', '<!doctype html><html><body></body></html>');
  }
  return send(res, 404, 'text/html; charset=utf-8', page('未找到', '<p>fixture 404</p>'));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`FIXTURE_READY http://127.0.0.1:${PORT}`);
});
