import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';

/**
 * v4.19 M4：知识检索结果复制引用。
 *
 * 真实知识库 + 文档检索下，点击「复制引用」后校验剪贴板：
 * 只含「标题 — /knowledge?kb=<id>」，不含正文，长度 ≤ 300，弹层保持打开。
 */

const UNIQUE = '鲸落复制标记';
const DOC_NAME = `${UNIQUE}说明.md`;
const BODY = `这段正文不应进入剪贴板：${UNIQUE} 内部细节。`;

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test('v4.19 知识结果复制引用：标题+深链、无正文、弹层不关闭', async ({ page, request }) => {
  const kbResponse = await request.post('/api/knowledge-bases', { data: { name: 'E2E 复制引用库' } });
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

  // 检索只匹配标题/来源，不依赖编译状态；等文档出现在列表即可
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

  await page.goto('/chat');
  await waitForHydrated(page);
  await page.keyboard.press('Control+Shift+F');
  await expect(page.getByTestId('global-search-dialog')).toBeVisible();
  await page.getByTestId('global-search-input').fill(UNIQUE);

  const copyButton = page.getByTestId('global-search-copy-knowledge').first();
  await expect(copyButton).toBeVisible({ timeout: 15_000 });
  await copyButton.click();

  await expect(page.getByTestId('global-search-copy-status')).toContainText('已复制引用');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain(DOC_NAME);
  expect(clipboard).toContain('/knowledge?kb=');
  expect(clipboard.length).toBeLessThanOrEqual(300);
  expect(clipboard).not.toContain(BODY);
  expect(clipboard).not.toContain('内部细节');

  // 复制不关闭弹层，也不触发导航
  await expect(page.getByTestId('global-search-dialog')).toBeVisible();
});
