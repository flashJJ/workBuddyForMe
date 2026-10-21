import { expect, test, type Page } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';

/**
 * v2.4 M3（P0-3）·「一键开启语音对话」e2e：覆盖验收 A1（体积/耗时预估 + 一键下载 + 可取消）、
 * A2（就绪后一次点击进入可说话的免手模式）、A3（默认两档 + 高级默认折叠）、A4（半双工边界文案）。
 *
 * A5（下载中断后重入不重下已完成文件）的文件级跳过语义由
 * packages/voice/src/models/downloader.test.ts「已存在且大小匹配的文件跳过下载」单测覆盖；
 * 此处只断言 UI 侧「就绪后不再要求下载」这一可见结果。
 *
 * 段→ASR→自动发送的完整链路已由 voice-vad.spec.ts 用假 worklet 覆盖，本 spec 不重复。
 */

const ASR_BYTES = 239_549_735;
const KOKORO_BYTES = 394_000_000;
const MELO_BYTES = 191_000_000;

const settings: Record<string, unknown> = {
  ttsEnabled: false,
  ttsEngine: 'sherpa_onnx',
  ttsModel: 'kokoro',
  ttsSpeakerId: 0,
  ttsSpeed: 1,
  ttsNumThreads: 4,
  asrEnabled: false,
  asrEngine: 'sherpa_onnx',
  asrNumThreads: 4,
  inputMode: 'ptt',
  vadSensitivity: 'balanced',
  vadSilenceMs: 600,
  modelMirrorBase: 'https://hf-mirror.com',
  modelsDir: null,
  avatarEnabled: false,
  avatarModelId: 'haru',
  petEnabled: false,
  petClickThrough: false,
  proactiveEnabled: false,
  proactiveIdleSeconds: 300,
};

/** 模型状态相位：测试按需切换 missing / downloading / ready */
let phase: 'missing' | 'downloading' | 'ready' = 'missing';
const downloadCalls: Array<Record<string, unknown>> = [];

function modelStatus() {
  const ready = phase === 'ready';
  const down = phase === 'downloading';
  const dl = (bytesTotal: number) => ({
    active: down,
    status: ready ? 'ready' : down ? 'downloading' : 'missing',
    bytesTotal,
    bytesDone: ready ? bytesTotal : down ? Math.floor(bytesTotal / 2) : 0,
    error: null,
  });
  const asr = dl(ASR_BYTES);
  const kokoro = dl(KOKORO_BYTES);
  const melo = dl(MELO_BYTES);
  return {
    asrReady: ready,
    ttsReady: ready,
    asrMissing: [],
    ttsMissing: [],
    asrTotalBytes: ASR_BYTES,
    ttsTotalBytes: KOKORO_BYTES,
    activeTtsModel: 'kokoro',
    ttsModels: [
      { model: 'kokoro', label: 'Kokoro 多角色声线', totalBytes: KOKORO_BYTES, ready, missing: [] },
      { model: 'melo', label: 'MeloTTS 中英女声', totalBytes: MELO_BYTES, ready, missing: [] },
    ],
    downloads: { asr, tts: kokoro, ttsByModel: { kokoro, melo } },
  };
}

async function mockVoiceRoutes(page: Page) {
  await page.route('**/api/voice/settings', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') Object.assign(settings, request.postDataJSON());
    await route.fulfill({ json: { success: true, data: { ...settings } } });
  });
  await page.route('**/api/voice/models/status', async (route) => {
    await route.fulfill({ json: { success: true, data: modelStatus() } });
  });
  await page.route('**/api/voice/models/download', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    downloadCalls.push(body);
    if (body.action === 'start') phase = 'downloading';
    if (body.action === 'cancel') phase = 'missing';
    await route.fulfill({ json: { success: true, data: { started: true } } });
  });
}

/** 直接把默认对话模型落到设置（不依赖 ① 的 UI 时序），保证 /chat 渲染出输入区 */
async function ensureDefaultChatModel(page: Page): Promise<void> {
  const providers = (await (await page.request.get('/api/providers')).json()).data as Array<{ id: string }>;
  const chatIds: string[] = [];
  for (const provider of providers) {
    const list = (await (await page.request.get(`/api/providers/${provider.id}/models`)).json())
      .data as Array<{ id: string; capabilities: string[] }>;
    for (const model of list) if (model.capabilities.includes('chat')) chatIds.push(model.id);
  }
  expect(chatIds.length, '需要 ① 先创建对话模型').toBeGreaterThan(0);
  await page.request.put('/api/settings', { data: { defaultChatModelId: chatIds[0] } });
}

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe.serial('v2.4 一键开启语音对话', () => {
  test.beforeEach(async ({ page }) => {
    phase = 'missing';
    downloadCalls.length = 0;
    await mockVoiceRoutes(page);
    // 首启向导是模态遮挡：先置位（全量跑时早已置位，单独跑本 spec 时可确定性通过）
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  test('① 准备对话模型（mock 供应商 + qs-chat）', async ({ page }) => {
    await page.goto('/settings');
    await waitForHydrated(page);
    await page.getByRole('button', { name: '新增供应商' }).click();
    await page.getByLabel('名称').fill('QS Mock 供应商');
    await page.getByLabel('Base URL').fill('http://mock.local/v1');
    await page.getByLabel('API Key').fill('sk-qs-mock');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: 'QS Mock 供应商' }).waitFor();

    const card = page
      .locator('[data-testid^="provider-card-"]')
      .filter({ hasText: 'QS Mock 供应商' })
      .last();
    await card.locator('[id^="model-id-"]').fill('qs-chat');
    await card.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 qs-chat')).toBeVisible();
    await chooseOption(page, page.getByLabel('默认对话模型'), 'qs-chat（qs-chat）');
    await expect(page.getByText('设置已保存').first()).toBeVisible();
  });

  test('② 未就绪：体积预估 + 下载引导 + 一键下载 + 可取消（A1/A4）', async ({ page }) => {
    await page.goto('/settings');
    await waitForHydrated(page);

    const quick = page.getByTestId('voice-quickstart-settings');
    await expect(quick).toBeVisible();
    const start = quick.getByTestId('voice-quickstart-button');
    // A1：按钮文案自带体积预估（体积取自模型状态接口，非硬编码）
    await expect(start).toContainText('需先下载约');
    await expect(start).toContainText('MB');
    // A4：入口常驻半双工边界声明
    await expect(page.getByTestId('voice-half-duplex-notice').first()).toContainText('说完再答');

    await start.click();
    await expect(page.getByTestId('voice-download-guide')).toBeVisible();
    await expect(page.getByTestId('voice-quickstart-size')).toContainText('视网速而定');
    await expect(page.getByTestId('voice-quickstart-disk')).toContainText('models\\voice');

    await page.getByTestId('voice-quickstart-download').click();
    await expect.poll(() => downloadCalls.length).toBeGreaterThan(0);
    expect(downloadCalls).toContainEqual({ kind: 'asr', action: 'start' });
    expect(downloadCalls).toContainEqual({ kind: 'tts', model: 'kokoro', action: 'start' });

    // A1：下载中可取消
    const cancel = page.getByTestId('voice-quickstart-cancel');
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect.poll(() => downloadCalls.some((call) => call.action === 'cancel')).toBe(true);
  });

  test('③ 就绪：对话页一次点击即武装免手（A2）', async ({ page }) => {
    phase = 'ready';
    await ensureDefaultChatModel(page);
    await page.goto('/chat');
    await waitForHydrated(page);

    const quick = page.getByTestId('voice-quickstart-button');
    await expect(quick).toHaveAttribute('data-ready', 'true');
    // 对话页是图标按钮：就绪文案落在可访问名上
    await expect(quick).toHaveAttribute('aria-label', '开启语音对话');

    // 一次点击：写入「开 ASR + 免手 + 开朗读」并当场武装
    await quick.click();
    const handsfree = page.getByTestId('handsfree-button');
    await expect(handsfree).toBeVisible();
    await expect(handsfree).toHaveAttribute('aria-pressed', 'true');
  });

  test('④ 默认档位 = 反应快，高级区默认折叠（A3）', async ({ page }) => {
    phase = 'ready';
    await page.goto('/settings');
    await waitForHydrated(page);

    // ③ 已把 inputMode 置为 vad：此处直接校验默认档位与折叠态
    await expect(page.getByTestId('voice-input-mode-vad')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('voice-profile-fast')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('voice-profile-tolerant')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('voice-silence-now')).toContainText('秒未说话');
    // A3：高级区默认收起
    await expect(page.getByTestId('voice-input-advanced')).toHaveCount(0);
    await page.getByTestId('voice-input-advanced-toggle').click();
    await expect(page.getByTestId('voice-vad-sensitivity')).toBeVisible();
  });

  test('⑤ 就绪后不再要求下载（A5 的 UI 侧结果）', async ({ page }) => {
    phase = 'ready';
    await page.goto('/settings');
    await waitForHydrated(page);

    const start = page.getByTestId('voice-quickstart-settings').getByTestId('voice-quickstart-button');
    await expect(start).toHaveAttribute('data-ready', 'true');
    await expect(start).toContainText('开启语音对话');
    await expect(start).not.toContainText('需先下载');
    // 就绪态不再需要展开下载引导
    await expect(page.getByTestId('voice-download-guide')).toHaveCount(0);
  });
});
