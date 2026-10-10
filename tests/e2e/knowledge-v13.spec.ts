import { expect, test, type Page } from '@playwright/test';

/**
 * v1.3 知识链路 E2E（TR-5.3）：WBFM_MOCK_AI=1，编译/静态引用/同名替换/治理全链路。
 * 场景串行依赖：前置（供应商+模型+助手+库）→ 上传编译 → 静态层引用坐标 →
 * 同名替换重编译 → 治理冲突面板。
 */

const KB_NAME = '编译验证库';
const ASSISTANT_NAME = 'v13 编译助手';

const DOC_FILENAME = 'ZK-900 智能相机说明.md';
const DOC_V1 = [
  '# ZK-900 智能相机说明',
  '',
  'ZK-900 智能相机支持夜间红外模式。',
  '',
  'ZK-900 的默认存储方案是本地 SD 卡。',
  '',
  'ZK-900 出厂固件版本为 3.2。',
].join('\n');
const DOC_V2 = DOC_V1.replace('ZK-900 的默认存储方案是本地 SD 卡。', 'ZK-900 的默认存储方案已改为云端同步。');

const QUESTION = 'ZK-900 的默认存储方案是什么？';

const FW_FILENAME = 'ZK-900 固件指南.md';
const DOC_FW = ['# ZK-900 固件指南', '', 'ZK-900 当前固件版本是 3.5。'].join('\n');

const mdFile = (name: string, content: string) => ({
  name,
  mimeType: 'text/markdown',
  buffer: Buffer.from(content, 'utf-8'),
});

/** 全新数据根首启必弹首次使用向导（模态遮挡后续操作）；跳过即写 hasOnboarded 标记 */
async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return; // 已标记首启完成，向导未弹出
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

async function createKb(page: Page): Promise<void> {
  await page.goto('/knowledge');
  await page.getByRole('button', { name: '+ 新建知识库' }).click();
  await page.getByLabel('名称').fill(KB_NAME);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('知识库已创建')).toBeVisible();
}

async function uploadDoc(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.getByLabel('选择文档上传').setInputFiles(file);
  await expect(page.getByText(`已上传 ${file.name}，正在后台索引`)).toBeVisible();
}

interface DocumentApiRecord {
  id: string;
  filename: string;
  compileStatus?: string;
  compiledAt?: string | null;
}

async function fetchDocuments(
  page: Page,
  kbId: string,
): Promise<DocumentApiRecord[]> {
  const res = await page.request.get(`/api/knowledge-bases/${kbId}/documents`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data?: DocumentApiRecord[] | { items?: DocumentApiRecord[] } };
  const data = body.data;
  return Array.isArray(data) ? data : (data?.items ?? []);
}

test.describe.serial('v1.3 知识链路', () => {
  let kbId = '';

  test('① 前置：供应商、模型、助手与知识库', async ({ page }) => {
    // 供应商 + 对话/向量模型（照 critical-path 模式）
    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await page.getByRole('button', { name: '新增供应商' }).click();
    await page.getByLabel('名称').fill('v13 Mock 供应商');
    await page.getByLabel('Base URL').fill('http://mock.local/v1');
    await page.getByLabel('API Key').fill('sk-mock-v13-1234567890');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('供应商已创建')).toBeVisible();

    // 全量跑时存量供应商卡片共存：模型表单操作限定在本卡片内
    const providerCard = page
      .locator('[data-testid^="provider-card-"]')
      .filter({ hasText: 'v13 Mock 供应商' });

    await providerCard.locator('[id^="model-id-"]').fill('mock-chat');
    await providerCard.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 mock-chat')).toBeVisible();

    await providerCard.locator('[id^="model-id-"]').fill('mock-embed');
    await providerCard.getByLabel('对话', { exact: true }).uncheck();
    await providerCard.getByLabel('向量', { exact: true }).check();
    await providerCard.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 mock-embed')).toBeVisible();

    await page.getByLabel('默认对话模型').selectOption({ label: 'mock-chat（mock-chat）' });
    await page.getByLabel('默认向量模型（知识库）').selectOption({ label: 'mock-embed（mock-embed）' });
    await expect(page.getByText('设置已保存').first()).toBeVisible();

    // 助手
    await page.goto('/assistants');
    await page.getByRole('button', { name: '新建助手' }).click();
    await page.getByLabel('名称').fill(ASSISTANT_NAME);
    await page.getByLabel('系统提示词（人设）').fill('你是严谨的知识助手，回答需给出依据。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已创建')).toBeVisible();

    // 知识库（记录 id 供后续 API 轮询）
    await createKb(page);
    const res = await page.request.get('/api/knowledge-bases');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data?: Array<{ id: string; name: string }> };
    const created = (body.data ?? []).find((kb) => kb.name === KB_NAME);
    expect(created).toBeDefined();
    kbId = created!.id;
  });

  test('② 上传文档：索引后自动编译至已编译', async ({ page }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: KB_NAME }).first().click();

    await uploadDoc(page, mdFile(DOC_FILENAME, DOC_V1));
    const documentList = page.getByTestId('document-list');
    await expect(documentList.getByText(DOC_FILENAME)).toBeVisible();
    await expect(page.getByText('已索引')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('compile-status-badge')).toHaveText('已编译', { timeout: 60_000 });
  });

  test('③ RAG 提问：静态层引用带实体标签与段落坐标', async ({ page }) => {
    // 助手绑定知识库（按名称定位卡片，避免多助手时误选）
    await page.goto('/assistants');
    const assistantCard = page
      .locator('[data-testid^="assistant-card-"]')
      .filter({ hasText: ASSISTANT_NAME });
    await assistantCard.getByRole('button', { name: '编辑' }).click();
    await page.getByLabel('关联知识库（自动 RAG）').selectOption({ label: KB_NAME });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已更新')).toBeVisible();

    // 提问：mock 回显检索第一命中（编译层实体条目置顶）
    await page.goto('/chat');
    await page.getByLabel('切换助手').selectOption({ label: `🤖 ${ASSISTANT_NAME}` });
    await page.getByLabel('消息输入框').fill(QUESTION);
    await page.getByLabel('消息输入框').press('Enter');

    await expect(page.getByText(/根据检索到的资料/)).toBeVisible();
    await expect(page.getByText(/本地 SD 卡/).first()).toBeVisible();

    // 引用：静态层「实体知识」徽标 + 段落坐标（md/txt 复用段号）
    const citations = page.getByTestId('citations');
    await expect(citations).toBeVisible();
    await expect(citations.getByTestId('citation-static-kind').first()).toHaveText('实体知识');
    await expect(citations.getByTestId('citation-location').first()).toHaveText(/第 \d+ 段/);
    await expect(citations.getByText(DOC_FILENAME).first()).toBeVisible();
  });

  test('④ 同名替换：复位重索引并自动重编译，旧内容零残留', async ({ page }) => {
    const before = await fetchDocuments(page, kbId);
    const prev = before.find((d) => d.filename === DOC_FILENAME);
    expect(prev?.compileStatus).toBe('ready');

    await page.goto('/knowledge');
    await page.getByRole('button', { name: KB_NAME }).first().click();
    await uploadDoc(page, mdFile(DOC_FILENAME, DOC_V2));

    // 轮询 API：同名不同 hash → 复用文档行 replaceContent，等重编译完成
    await expect
      .poll(async () => {
        const docs = await fetchDocuments(page, kbId);
        const doc = docs.find((d) => d.filename === DOC_FILENAME);
        return doc?.compileStatus === 'ready' && doc.compiledAt !== prev?.compiledAt ? 'done' : 'pending';
      }, { timeout: 90_000 })
      .toBe('done');

    // 提问验证新内容生效、旧内容零残留
    await page.goto('/chat');
    await page.getByLabel('切换助手').selectOption({ label: `🤖 ${ASSISTANT_NAME}` });
    await page.getByLabel('消息输入框').fill(QUESTION);
    await page.getByLabel('消息输入框').press('Enter');

    await expect(page.getByText(/根据检索到的资料/)).toBeVisible();
    await expect(page.getByText(/云端同步/).first()).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('本地 SD 卡');
  });

  test('⑤ 知识治理：跨文档版本冲突进入待裁决区', async ({ page }) => {
    await page.goto('/knowledge');
    await page.getByRole('button', { name: KB_NAME }).first().click();
    await uploadDoc(page, mdFile(FW_FILENAME, DOC_FW));

    // 两文档均编译完成后冲突才可见
    await expect
      .poll(async () => {
        const docs = await fetchDocuments(page, kbId);
        return docs.length >= 2 && docs.every((d) => d.compileStatus === 'ready') ? 'done' : 'pending';
      }, { timeout: 90_000 })
      .toBe('done');

    await page.reload();
    await page.getByRole('button', { name: KB_NAME }).first().click();

    const governance = page.getByTestId('knowledge-governance');
    await expect(governance).toBeVisible({ timeout: 30_000 });
    const conflicts = page.getByTestId('conflicts-section');
    await expect(conflicts.getByTestId('conflict-item').first()).toBeVisible();
    await expect(conflicts.getByText('ZK-900').first()).toBeVisible();
    await expect(conflicts.getByText('版本号', { exact: true }).first()).toBeVisible();
  });
});
