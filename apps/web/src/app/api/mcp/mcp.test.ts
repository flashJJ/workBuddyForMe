import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as listServers, POST as createServer } from './servers/route';
import { PATCH, DELETE as removeServer } from './servers/[id]/route';
import { GET as listTools } from './tools/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

// 集成测试不拉真实 MCP 子进程：一律 enabled=false（reconcile 跳过禁用服务器）
const disabledStdio = {
  transport: 'stdio' as const,
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs'],
  enabled: false,
};

describe('MCP 服务器管理路由（v0.6 M1）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-mcp-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('空列表 200；创建 201（字段归一）后列表含连接状态视图', async () => {
    const empty = await listServers(new Request('http://x'));
    expect((await empty.json()).data).toEqual([]);

    const created = await createServer(jsonRequest(disabledStdio));
    expect(created.status).toBe(201);
    const server = (await created.json()).data;
    expect(server).toMatchObject({
      transport: 'stdio',
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs'],
      env: {},
      enabled: false,
      status: 'disconnected',
      toolCount: 0,
    });

    const listed = await listServers(new Request('http://x'));
    const data = (await listed.json()).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ name: 'filesystem', status: 'disconnected' });
  });

  it('创建校验：非法名称/缺命令/缺 transport 422', async () => {
    const badName = await createServer(
      jsonRequest({ transport: 'stdio', name: '中文名', command: 'npx', enabled: false }),
    );
    expect(badName.status).toBe(422);

    const noCommand = await createServer(jsonRequest({ transport: 'stdio', name: 'fs', enabled: false }));
    expect(noCommand.status).toBe(422);

    const noTransport = await createServer(jsonRequest({ name: 'fs', command: 'npx', enabled: false }));
    expect(noTransport.status).toBe(422);
  });

  it('重名 409（名称即工具命名空间，必须唯一）', async () => {
    const first = await createServer(jsonRequest(disabledStdio));
    expect(first.status).toBe(201);
    const second = await createServer(jsonRequest(disabledStdio));
    expect(second.status).toBe(409);
    expect((await second.json()).error.code).toBe('CONFLICT');
  });

  it('部分更新：改名/改参数 200；非法 body 422；不存在 404', async () => {
    const id = (await (await createServer(jsonRequest(disabledStdio))).json()).data.id;

    const updated = await PATCH(
      jsonRequest({ transport: 'stdio', name: 'docs_fs', args: ['-y', 'other-server'] }, 'PATCH'),
      idParams(id),
    );
    expect(updated.status).toBe(200);
    const server = (await updated.json()).data;
    expect(server).toMatchObject({ name: 'docs_fs', args: ['-y', 'other-server'] });

    const badBody = await PATCH(jsonRequest({ transport: 'stdio' }, 'PATCH'), idParams(id));
    expect(badBody.status).toBe(422);

    const missing = await PATCH(
      jsonRequest({ transport: 'stdio', name: 'another' }, 'PATCH'),
      idParams('no-such-id'),
    );
    expect(missing.status).toBe(404);
  });

  it('改名冲突 409', async () => {
    const a = (await (await createServer(jsonRequest(disabledStdio))).json()).data.id;
    await createServer(jsonRequest({ ...disabledStdio, name: 'other' }));
    const conflict = await PATCH(
      jsonRequest({ transport: 'stdio', name: 'other' }, 'PATCH'),
      idParams(a),
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe('CONFLICT');
  });

  it('删除 200 后列表为空；重复删除 404', async () => {
    const id = (await (await createServer(jsonRequest(disabledStdio))).json()).data.id;

    const removed = await removeServer(new Request('http://x', { method: 'DELETE' }), idParams(id));
    expect(removed.status).toBe(200);
    expect((await removed.json()).data).toEqual({ id });

    const again = await removeServer(new Request('http://x', { method: 'DELETE' }), idParams(id));
    expect(again.status).toBe(404);

    const listed = await listServers(new Request('http://x'));
    expect((await listed.json()).data).toEqual([]);
  });

  it('工具清单：无连接时 200 空数组', async () => {
    await createServer(jsonRequest(disabledStdio));
    const tools = await listTools(new Request('http://x'));
    expect(tools.status).toBe(200);
    expect((await tools.json()).data).toEqual([]);
  });
});
