import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { BUILTIN_ASSISTANT } from '@wbfm/core/services';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET, POST } from './route';
import { GET as GET_BY_CHILD } from '../../../branches/route';

const jsonRequest = (method: string, body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('v2.21 分支 API', () => {
  let db: DatabaseInstance;
  let parentId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-branch-')));
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    __setContainerForTest(services);
    parentId = services.conversations.create(BUILTIN_ASSISTANT.id, '父会话').id;
  });

  it('派生返回 queued 子会话；列表默认不含归档', async () => {
    const response = await POST(jsonRequest('POST', { goal: '整理竞品', title: '竞品' }), params(parentId));
    const created = (await response.json()) as {
      data: {
        branch: { id: string; status: string; depth: number };
        childConversationId: string;
        conversation: { id: string; title: string };
      };
    };
    expect(created.data.branch).toMatchObject({ status: 'queued', depth: 1 });
    expect(created.data.childConversationId).toBeTruthy();
    expect(created.data.conversation.id).toBe(created.data.childConversationId);

    const listedResponse = await GET(
      new Request(`http://127.0.0.1/x?includeArchived=false`),
      params(parentId),
    );
    const listed = (await listedResponse.json()) as {
      data: { branches: unknown[]; budget: { usedTokens: number; limitTokens: number } };
    };
    expect(listed.data.branches).toHaveLength(1);
    expect(listed.data.budget.limitTokens).toBe(200000);

    // v2.21 M3：子会话反查来源分支
    const byChild = await GET_BY_CHILD(
      new Request(
        `http://127.0.0.1/x?childConversationId=${encodeURIComponent(created.data.childConversationId)}`,
      ),
    );
    const found = (await byChild.json()) as { data: { branch: { id: string } | null } };
    expect(found.data.branch?.id).toBe(created.data.branch.id);
  });

  it('非法 goal：422 校验失败', async () => {
    const response = await POST(jsonRequest('POST', { goal: '   ' }), params(parentId));
    expect(response.status).toBe(422);
  });
});
