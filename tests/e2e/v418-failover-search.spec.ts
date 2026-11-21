import { expect, test } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.18 M6：稳与找得到的端到端验收。
 *
 * 服务器以 WBFM_MOCK_AI=1 启动，链路（SSE、事件日志、FTS、知识库文档）全部真实运行：
 * 1. `[eval-fail:mock-chat:429]` 让主模型返回 429，备用模型接管并在消息流显示切换提示；
 * 2. 同一关键词同时命中会话事件与知识库文档，验证跨域分组与深链打开。
 */

const UNIQUE = '蓝鲸检索标记';
const KB_NAME = 'E2E 跨域检索库';
const DOC_NAME = `${UNIQUE}说明.md`;

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test.describe.serial('v4.18 稳与找得到', () => {
  test('① 429 触发自动切换，消息流可见', async ({ page, request }) => {
    const primary = await ensureMockChatModel(request, {
      providerName: 'E2E 切换供应商',
      modelName: 'mock-chat',
    });
    const fallback = await ensureMockChatModel(request, {
      providerName: 'E2E 切换供应商',
      modelName: 'mock-chat-fallback',
    });
    const created = await request.post('/api/assistants', {
      data: {
        name: '切换助手',
        modelId: primary.modelId,
        fallbackModelId: fallback.modelId,
      },
    });
    expect(created.ok(), `创建助手失败：${created.status()}`).toBeTruthy();

    await page.goto('/chat');
    await waitForHydrated(page);
    await chooseOption(page, page.getByLabel('切换助手'), /切换助手/);

    await page.getByLabel('消息输入框').fill(`[eval-fail:mock-chat:429] ${UNIQUE} 限流切换测试`);
    await page.getByLabel('消息输入框').press('Enter');

    // 切换提示包含目标模型展示名；随后回答正常完成
    const notice = page.getByTestId('model-switch-notice').last();
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toContainText('mock-chat-fallback');
    await expect(page.getByText(/mock 模型/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible();
  });

  test('② 跨域检索命中会话与知识库并打开深链', async ({ page, request }) => {
    await page.goto('/chat');
    await waitForHydrated(page);
    await chooseOption(page, page.getByLabel('切换助手'), /切换助手/);

    // 会话事件：上一条消息已写入 session_events（含 UNIQUE），这里再补一条普通消息
    await page.getByLabel('消息输入框').fill(`${UNIQUE} 的上下文线索`);
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText(/mock 模型/).last()).toBeVisible({ timeout: 30_000 });

    // 知识库：建库并上传同名关键词文档，等待编译 ready
    const kbResponse = await request.post('/api/knowledge-bases', { data: { name: KB_NAME } });
    expect(kbResponse.ok(), `创建知识库失败：${kbResponse.status()}`).toBeTruthy();
    const kb = ((await kbResponse.json()) as { data: { id: string } }).data;
    const upload = await request.post(`/api/knowledge-bases/${kb.id}/documents`, {
      multipart: {
        file: {
          name: DOC_NAME,
          mimeType: 'text/markdown',
          buffer: Buffer.from(`${UNIQUE} 文档内容：用于验证跨域检索深链。`, 'utf-8'),
        },
      },
    });
    expect(upload.ok(), `上传文档失败：${upload.status()}`).toBeTruthy();
    // E2E 无 embedding 模型时编译按设计跳过；检索只匹配文档标题/来源，不依赖编译状态
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

    // 打开全局检索：两个域都应出现
    await page.keyboard.press('Control+Shift+F');
    const dialog = page.getByTestId('global-search-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('global-search-input').fill(UNIQUE);
    await expect(page.getByTestId('global-search-group-chat')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('global-search-group-knowledge')).toBeVisible({ timeout: 15_000 });

    // 打开知识结果 → /knowledge?kb= 并选中目标库
    await page.getByTestId('global-search-hit-knowledge').first().click();
    await expect(page).toHaveURL(/\/knowledge\?kb=/);
    await expect(page.getByRole('heading', { name: KB_NAME })).toBeVisible({ timeout: 15_000 });

    // 再次检索并打开会话结果 → 会话与消息双参数深链
    await page.keyboard.press('Control+Shift+F');
    await page.getByTestId('global-search-input').fill(UNIQUE);
    await expect(page.getByTestId('global-search-hit-chat').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('global-search-hit-chat').first().click();
    await expect(page).toHaveURL(/\/chat\?conversation=[^&]+&message=/);
  });
});
