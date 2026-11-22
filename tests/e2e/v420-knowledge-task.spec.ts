import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';

/**
 * v4.20 M4.4：知识「以引用新建任务」。
 *
 * 真实知识库 + 文档检索下点击「新建任务」：
 * - 跳转 `/tasks?draft=`，目标框预填「请基于文档《标题》继续处理：深链」；
 * - 只预填不提交：不发起创建任务请求；
 * - 草稿不含正文。
 */

const UNIQUE = '鲸落任务标记';
const DOC_NAME = `${UNIQUE}说明.md`;
const BODY = `这段正文不应进入草稿：${UNIQUE} 内部细节。`;

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test('v4.20 知识新建任务：预填草稿且不自动提交', async ({ page, request }) => {
  const kbResponse = await request.post('/api/knowledge-bases', { data: { name: 'E2E 新建任务库' } });
  expect(kbResponse.ok(), `创建知识库失败：${kbResponse.status()}`).toBeTruthy();
  const kb = ((await kbResponse.json()) as { data: { id: string } }).data;

  const upload = await request.post(`/api/knowledge-bases/${kb.id}/documents`, {
    multipart: {
      file: {
        name: DOC_NAME,
        mimeType: 'text/markdown',
        buffer: Buffer.from(BODY, 'utf-8'),
      },
    },
  });
  expect(upload.ok(), `上传文档失败：${upload.status()}`).toBeTruthy();

  await expect
    .poll(
      async () => {
        const list = await request.get(`/api/knowledge-bases/${kb.id}/documents`);
        const docs = ((await list.json()) as { data: Array<{ filename: string }> }).data;
        return docs.some((item) => item.filename === DOC_NAME);
      },
      { timeout: 15_000, intervals: [300, 1_000] },
    )
    .toBe(true);

  let createdTasks = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/tasks')) createdTasks += 1;
  });

  await page.goto('/chat');
  await waitForHydrated(page);
  await page.keyboard.press('Control+Shift+F');
  await expect(page.getByTestId('global-search-dialog')).toBeVisible();
  await page.getByTestId('global-search-input').fill(UNIQUE);

  const newTask = page.getByTestId('global-search-new-task').first();
  await expect(newTask).toBeVisible({ timeout: 15_000 });
  await newTask.click();

  await page.waitForURL(/\/tasks\?draft=/, { timeout: 15_000 });
  const goal = page.getByTestId('task-goal-input');
  const expected = `请基于文档《${DOC_NAME}》继续处理：/knowledge?kb=${kb.id}`;
  await expect(goal).toHaveValue(expected, { timeout: 15_000 });
  expect(await goal.inputValue()).not.toContain('内部细节');

  // 只预填：等待一小段时间确认没有创建任务的请求
  await page.waitForTimeout(1_000);
  expect(createdTasks, '不应自动创建任务').toBe(0);
});
