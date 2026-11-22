import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.20 M3：冷启动打点可用，并落一份 perf 样本供 chat-report 消费。
 */

let conversationId = '';

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
  await request.put('/api/settings', { data: { hasOnboarded: true } });
  const model = await ensureMockChatModel(request, {
    providerName: 'E2E 冷启动供应商',
    modelName: 'mock-chat',
  });
  const assistant = await request.post('/api/assistants', {
    data: { name: '冷启动助手', modelId: model.modelId },
  });
  expect(assistant.ok()).toBeTruthy();
  const assistantId = ((await assistant.json()) as { data: { id: string } }).data.id;
  const conversation = await request.post('/api/conversations', {
    data: { assistantId, title: '冷启动会话' },
  });
  expect(conversation.ok()).toBeTruthy();
  conversationId = ((await conversation.json()) as { data: { id: string } }).data.id;
});

test('冷启动：app-ready 打点存在且可写入 perf 样本', async ({ page }) => {
  await page.goto(`/chat?conversation=${conversationId}`);
  await waitForHydrated(page);
  await expect(page.getByTestId('composer')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => performance.getEntriesByName('wbfm:app-ready').length > 0,
    undefined,
    { timeout: 30_000 },
  );

  const coldStartMs = await page.evaluate(() => {
    const entry = performance.getEntriesByName('wbfm:app-ready')[0];
    return entry ? Math.round(entry.startTime) : 0;
  });
  expect(coldStartMs).toBeGreaterThan(0);
  expect(coldStartMs).toBeLessThan(30_000);

  const outDir = join(process.cwd(), 'test-results', 'perf');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'samples-cold-start.json'),
    `${JSON.stringify({
      scenarios: [{ name: 'cold-start', samples: [{ coldStartMs }] }],
    }, null, 2)}\n`,
    'utf-8',
  );
});
