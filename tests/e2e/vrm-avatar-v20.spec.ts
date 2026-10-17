import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.0 M4 VRM 导入 e2e。
 * 导入向导 UI + 服务端魔数/VRM 扩展双校验 + 已导入列表 + 形象选择器 VRM optgroup。
 * 真实可渲染 VRM 模型的 three.js 舞台混排由 spike 页与单测覆盖，本规格只锁导入链路。
 */

/** 构造最小合法 VRM（GLB + VRMC_vrm 扩展声明 + meta，不含 BIN chunk） */
function buildMinimalVrm(metaName: string): Buffer {
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'wbfm-e2e' },
    extensionsUsed: ['VRMC_vrm'],
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        meta: {
          name: metaName,
          authors: ['e2e-bot'],
          licenseUrl: 'https://example.com/license',
          avatarPermission: 'onlyAuthor',
          commercialUsage: 'personalNonProfit',
          allowExcessivelyViolentUsage: false,
          allowExcessivelySexualUsage: false,
          allowPoliticalOrReligiousUsage: false,
          allowAntisocialOrHateUsage: false,
          creditNotation: 'unnecessary',
          allowRedistribution: false,
          modification: 'prohibited',
        },
      },
    },
  });
  const jsonBuf = Buffer.from(json, 'utf8');
  // JSON chunk 需 4 字节对齐（空格填充）
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonPadded.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  const chunkHead = Buffer.alloc(8);
  chunkHead.writeUInt32LE(jsonPadded.length, 0);
  chunkHead.write('JSON', 4, 'ascii');
  return Buffer.concat([header, chunkHead, jsonPadded]);
}

/** 构造「GLB 魔数正确但无 VRM 扩展」的负例文件 */
function buildGlbWithoutVrm(): Buffer {
  const json = JSON.stringify({ asset: { version: '2.0' } });
  const jsonBuf = Buffer.from(json, 'utf8');
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonPadded.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  const chunkHead = Buffer.alloc(8);
  chunkHead.writeUInt32LE(jsonPadded.length, 0);
  chunkHead.write('JSON', 4, 'ascii');
  return Buffer.concat([header, chunkHead, jsonPadded]);
}

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
}

async function cleanupVrmAvatars(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/vrm-avatars');
  if (!res.ok()) return;
  const data = (await res.json()) as { data?: { avatars?: Array<{ id: string }> } };
  for (const avatar of data.data?.avatars ?? []) {
    await request.delete(`/api/vrm-avatars/${avatar.id}`);
  }
}

test.describe.serial('v2.0 M4 VRM 形象导入', () => {
  test.beforeAll(async ({ request }) => {
    await cleanupVrmAvatars(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupVrmAvatars(request);
  });

  test('导入向导：扩展名错误前端直接拒绝、合法文件展示 meta 并须勾选免责', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.getByTestId('vrm-import-section')).toBeVisible();

    // 负例 1：非 .vrm 扩展名 —— 前端拒绝，不出现免责区
    await page.getByTestId('vrm-file-input').setInputFiles({
      name: 'fake.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(page.getByTestId('vrm-disclaimer-checkbox')).toHaveCount(0);

    // 正例路径：最小合法 VRM —— meta 区出现名称/作者/版本，勾选前导入按钮禁用
    await page.getByTestId('vrm-file-input').setInputFiles({
      name: 'e2e-avatar.vrm',
      mimeType: 'model/gltf-binary',
      buffer: buildMinimalVrm('E2E 测试VRM'),
    });
    await expect(page.getByTestId('vrm-disclaimer-checkbox')).toBeVisible();
    await expect(page.getByTestId('vrm-import-confirm')).toBeDisabled();
    await page.getByTestId('vrm-disclaimer-checkbox').check();
    await expect(page.getByTestId('vrm-import-confirm')).toBeEnabled();
  });

  test('服务端双校验：无 VRM 扩展的 GLB 被拒，合法 VRM 入库并出现在列表', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.getByTestId('vrm-import-section')).toBeVisible();

    // 负例 2：GLB 魔数正确但无 VRM 扩展 —— 服务端 422，不落库
    await page.getByTestId('vrm-file-input').setInputFiles({
      name: 'not-vrm.vrm',
      mimeType: 'model/gltf-binary',
      buffer: buildGlbWithoutVrm(),
    });
    await page.getByTestId('vrm-disclaimer-checkbox').check();
    await page.getByTestId('vrm-import-confirm').click();
    await expect(page.getByTestId('vrm-avatar-list')).not.toContainText('not-vrm');

    // 正例：合法 VRM 上传成功，列表出现记录
    // meta 经 FileReader 异步解析：等 meta 区出现名称再点击，确保服务端按 meta.name 入库
    await page.getByTestId('vrm-file-input').setInputFiles({
      name: 'valid-avatar.vrm',
      mimeType: 'model/gltf-binary',
      buffer: buildMinimalVrm('合法VRM'),
    });
    await expect(page.getByTestId('vrm-import-section')).toContainText('合法VRM');
    await page.getByTestId('vrm-disclaimer-checkbox').check();
    await page.getByTestId('vrm-import-confirm').click();
    await expect(page.getByTestId('vrm-avatar-list')).toContainText('合法VRM', { timeout: 15_000 });
  });

  test('已导入 VRM 出现在形象选择器 optgroup 中，选中后持久化', async ({ page, request }) => {
    // 先确保有一条 VRM 记录
    const listRes = await request.get('/api/vrm-avatars');
    const listData = (await listRes.json()) as { data?: { avatars?: Array<{ id: string; fileRef: string }> } };
    if (!listData.data?.avatars?.length) {
      await request.post(
        '/api/vrm-avatars',
        {
          multipart: {
            file: { name: 'seed.vrm', mimeType: 'model/gltf-binary', buffer: buildMinimalVrm('种子VRM') },
            name: '种子VRM',
          },
        },
      );
    }

    await gotoSettings(page);
    // 默认 avatarEnabled=false，形象选择器被条件渲染挡掉——先勾选开启
    const avatarEnabled = page.getByTestId('avatar-enabled');
    if (!(await avatarEnabled.isChecked())) {
      await avatarEnabled.check();
    }
    const modelSelect = page.getByTestId('avatar-model');
    await expect(modelSelect).toBeVisible();
    // VRM optgroup 出现（option 在 select 收起时视为 hidden，只断言存在性）
    const vrmOption = modelSelect.locator('optgroup').nth(1).locator('option').first();
    await expect(vrmOption).toBeAttached();
    const value = await vrmOption.getAttribute('value');
    expect(value).toMatch(/^vrm:/);
    // 选中后轮询 settings 直到 avatarModelId 落库（不依赖响应捕获，避免冷编译时序）
    await modelSelect.selectOption(value!);
    await expect
      .poll(
        async () => {
          const res = await request.get('/api/voice/settings');
          const data = (await res.json()) as { data?: { avatarModelId?: string } };
          return data.data?.avatarModelId;
        },
        { timeout: 15_000, intervals: [500, 1000] },
      )
      .toBe(value);
  });
});
