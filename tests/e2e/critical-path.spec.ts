import { expect, test } from '@playwright/test';

/**
 * 关键路径 E2E（TR-34.1）：服务器以 WBFM_MOCK_AI=1 启动，
 * 供应商/模型调用全部命中进程内 mock，链路（含 RAG 检索）真实走数据库与 SSE。
 * 场景串行依赖：供应商 → 助手 → 对话 → 知识库 → RAG 引用。
 */

const DOC_FILENAME = '量子咖啡机-说明.md';
const DOC_CONTENT =
  '量子咖啡机支持语音唤醒与手机联动。'.repeat(20) +
  '量子咖啡机的保修期为两年，保修期内可免费更换研磨组件。'.repeat(20);

test.describe.serial('WorkBuddy 关键路径', () => {
  test('① 配置供应商与模型，连接测试成功', async ({ page }) => {
    await page.goto('/settings');

    await page.getByRole('button', { name: '新增供应商' }).click();
    await page.getByLabel('名称').fill('Mock 供应商');
    await page.getByLabel('Base URL').fill('http://mock.local/v1');
    await page.getByLabel('API Key').fill('sk-mock-1234567890');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('供应商已创建')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mock 供应商' })).toBeVisible();

    // 添加对话模型 mock-chat（默认勾选「对话」能力）
    await page.locator('[id^="model-id-"]').fill('mock-chat');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 mock-chat')).toBeVisible();

    // 添加向量模型 mock-embed：切换能力勾选后提交
    await page.locator('[id^="model-id-"]').fill('mock-embed');
    await page.getByLabel('对话', { exact: true }).uncheck();
    await page.getByLabel('向量', { exact: true }).check();
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 mock-embed')).toBeVisible();

    // 连接测试（mock testConnection 恒成功）
    await page.getByRole('button', { name: '测试连接' }).click();
    await expect(page.getByText('连接成功')).toBeVisible();

    // 设为默认对话/向量模型
    await page.getByLabel('默认对话模型').selectOption({ label: 'mock-chat（mock-chat）' });
    await page.getByLabel('默认向量模型（知识库）').selectOption({ label: 'mock-embed（mock-embed）' });
    await expect(page.getByText('设置已保存').first()).toBeVisible();
  });

  test('② 创建自定义助手', async ({ page }) => {
    await page.goto('/assistants');

    await page.getByRole('button', { name: '新建助手' }).click();
    await page.getByLabel('名称').fill('知识助手');
    await page.getByLabel('系统提示词（人设）').fill('你是严谨的私人知识助手，回答需给出依据。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已创建')).toBeVisible();
    await expect(page.getByRole('heading', { name: '知识助手' })).toBeVisible();
  });

  test('③ 新建对话：流式收发与中途停止', async ({ page }) => {
    await page.goto('/chat');

    // 正常流式收发
    await page.getByLabel('消息输入框').fill('你好，介绍一下你自己');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText(/mock 模型/).first()).toBeVisible();

    // 长回复期间点击停止，助手消息出现「已停止」标记
    await page.getByLabel('消息输入框').fill('请长回答：详细说说工作台规划');
    await page.getByLabel('消息输入框').press('Enter');
    await page.getByRole('button', { name: /停止生成/ }).click();
    await expect(page.getByText('已停止').first()).toBeVisible();
    // 停止后输入区恢复可用
    await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible();
  });

  test('④ 创建知识库并上传文档至 indexed', async ({ page }) => {
    await page.goto('/knowledge');

    await page.getByRole('button', { name: '+ 新建知识库' }).click();
    await page.getByLabel('名称').fill('产品资料库');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('知识库已创建')).toBeVisible();

    await page
      .getByLabel('选择文档上传')
      .setInputFiles({
        name: DOC_FILENAME,
        mimeType: 'text/markdown',
        buffer: Buffer.from(DOC_CONTENT, 'utf-8'),
      });
    await expect(page.getByText(`已上传 ${DOC_FILENAME}`)).toBeVisible();
    const documentList = page.getByTestId('document-list');
    await expect(documentList.getByText(DOC_FILENAME)).toBeVisible();
    await expect(page.getByText('已索引')).toBeVisible({ timeout: 30_000 });
    await expect(documentList.getByText(/个分片/)).toBeVisible();
  });

  test('⑤ RAG 提问：回答基于资料并展示引用', async ({ page }) => {
    // 编辑助手绑定知识库
    await page.goto('/assistants');
    await page.getByRole('button', { name: '编辑' }).last().click();
    await page
      .getByLabel('关联知识库（自动 RAG）')
      .selectOption({ label: '产品资料库' });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已更新')).toBeVisible();

    await page.goto('/chat');
    await page.getByLabel('切换助手').selectOption({ label: '🤖 知识助手' });
    await page.getByLabel('消息输入框').fill('量子咖啡机的保修期是多久？');
    await page.getByLabel('消息输入框').press('Enter');

    // mock 从「参考资料」回显依据，且引用来源为上传文档
    await expect(page.getByText(/根据检索到的资料/)).toBeVisible();
    const citations = page.getByTestId('citations');
    await expect(citations).toBeVisible();
    await expect(citations.getByText(DOC_FILENAME).first()).toBeVisible();
  });
});
