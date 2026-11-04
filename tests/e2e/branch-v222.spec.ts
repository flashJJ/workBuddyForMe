import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * v2.22 分支可靠性 e2e：
 * - 排队取消 → 终态回传（空结果、需核对）→ 图出现回传节点；
 * - 终态分支重试 → 新分支排队，旧分支保持终态；
 * - 备份导出/恢复带上分支事件轨（branchEventCount / imported.branchEvents）。
 * 不依赖真实供应商：全部停在 queued，取消即可产生完整终态事件。
 */

type Envelope<T> = { data?: T };

interface BranchDetail {
  branch: {
    id: string;
    status: string;
    statusReason: string | null;
    evidence: {
      summary: string;
      needsReview: boolean;
      usage: unknown;
    } | null;
  };
  evidence: {
    summary: string;
    needsReview: boolean;
    usage: unknown;
  } | null;
}

async function createParent(request: APIRequestContext): Promise<string> {
  const assistants =
    ((await (await request.get('/api/assistants')).json()) as Envelope<Array<{ id: string }>>).data ?? [];
  const res = await request.post('/api/conversations', {
    data: { assistantId: assistants[0]!.id, title: 'v2.22 分支父会话' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as Envelope<{ id: string }>).data!.id;
}

test.describe.serial('v2.22 分支可靠性', () => {
  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  test('排队取消写回传；图可见回传节点；终态可重试', async ({ request }) => {
    const parentId = await createParent(request);
    const childIds: string[] = [];
    const branchIds: string[] = [];
    try {
      const created = ((await (
        await request.post(`/api/conversations/${parentId}/branches`, {
          data: { goal: '取消后应留下交代', title: 'e2e 终态分支', autoStart: false },
        })
      ).json()) as Envelope<{ branch: { id: string }; childConversationId: string }>).data!;
      branchIds.push(created.branch.id);
      childIds.push(created.childConversationId);

      const cancelled = await request.post(`/api/branches/${created.branch.id}/cancel`);
      expect(cancelled.status()).toBe(200);
      const detail = ((await (
        await request.get(`/api/branches/${created.branch.id}`)
      ).json()) as Envelope<BranchDetail>).data!;
      expect(detail.branch.status).toBe('cancelled');
      expect(detail.evidence?.summary).toBe('');
      expect(detail.evidence?.needsReview).toBe(true);
      expect(detail.evidence?.usage).toBeNull();

      const graph = ((await (
        await request.get(`/api/conversations/${parentId}/run-graph?scope=branch`)
      ).json()) as Envelope<{ nodes: Array<{ kind: string; scopeId: string }> }>).data!;
      expect(
        graph.nodes.some(
          (node) => node.kind === 'branch_return' && node.scopeId === created.branch.id,
        ),
      ).toBe(true);

      const retryRes = await request.post(`/api/branches/${created.branch.id}/retry`);
      expect(retryRes.status()).toBe(201);
      const retried = ((await retryRes.json()) as Envelope<{
        branch: { id: string; status: string };
        childConversationId: string;
        retriedFrom: string;
      }>).data!;
      expect(retried.retriedFrom).toBe(created.branch.id);
      // 重试复用 create(autoStart=true)：立即进入排队或已开始运行
      expect(retried.branch.status).toMatch(/queued|running/);
      branchIds.push(retried.branch.id);
      childIds.push(retried.childConversationId);

      const afterRetry = ((await (
        await request.get(`/api/branches/${created.branch.id}`)
      ).json()) as Envelope<BranchDetail>).data!;
      expect(afterRetry.branch.status).toBe('cancelled');
    } finally {
      for (const id of branchIds) await request.delete(`/api/branches/${id}`);
      for (const id of childIds) await request.delete(`/api/conversations/${id}`);
      await request.delete(`/api/conversations/${parentId}`);
    }
  });

  test('备份往返保留分支事件（manifest 计数 + 恢复统计）', async ({ request }) => {
    const parentId = await createParent(request);
    try {
      const created = ((await (
        await request.post(`/api/conversations/${parentId}/branches`, {
          data: { goal: '分支事件随备份走', title: 'e2e 备份分支', autoStart: false },
        })
      ).json()) as Envelope<{ branch: { id: string }; childConversationId: string }>).data!;
      await request.post(`/api/branches/${created.branch.id}/cancel`);

      const exportRes = await request.post('/api/backup/export', {
        data: { tracks: ['conversations'] },
      });
      expect(exportRes.status()).toBe(200);
      const archive = Buffer.from(await exportRes.body());

      const restoreRes = await request.post('/api/backup/restore', {
        multipart: {
          file: { name: 'v222-backup.tar.gz', mimeType: 'application/gzip', buffer: archive },
        },
      });
      expect(restoreRes.status()).toBe(200);
      const restored = ((await restoreRes.json()) as Envelope<{
        result: {
          manifest: { tracks: { conversations: { branchEventCount?: number } } };
          imported: { branchEvents: number };
        };
      }>).data!;
      expect(restored.result.manifest.tracks.conversations.branchEventCount).toBeGreaterThanOrEqual(3);
      expect(restored.result.imported.branchEvents).toBeGreaterThanOrEqual(3);

      await request.delete(`/api/branches/${created.branch.id}`);
      await request.delete(`/api/conversations/${created.childConversationId}`);
    } finally {
      await request.delete(`/api/conversations/${parentId}`);
    }
  });
});
