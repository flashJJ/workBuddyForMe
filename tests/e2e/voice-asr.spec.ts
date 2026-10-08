import { expect, test, type Page } from '@playwright/test';

/**
 * M2 语音输入全链路 E2E（mock 语音引擎，真 mic 采集链路）：
 * - /api/voice/* 路由拦截：模型恒就绪、ASR 恒返回固定中文文本（引擎在真机/单测层验证）；
 * - Chromium fake media device 提供真实麦克风音频流，PTT 采集→16k WAV 打包走浏览器真链路；
 * - 识别文本自动发送，/api/chat/stream 走 WBFM_MOCK_AI 真实 SSE。
 */

const ASR_TEXT = '你好，这是语音识别的一句话';

const DEFAULT_SETTINGS = {
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
  vadSilenceMs: 900,
  modelMirrorBase: 'https://hf-mirror.com',
  modelsDir: null,
  avatarEnabled: false,
  avatarModelId: 'shizuku',
  petEnabled: false,
  petClickThrough: false,
  proactiveEnabled: false,
  proactiveIdleSeconds: 300,
};

// 跨用例保留语音设置状态（路由处理为浏览器级，页面间状态由本对象承接）
const voiceSettings = { ...DEFAULT_SETTINGS };

function modelStatus(overrides: Record<string, unknown> = {}) {
  const kokoroDl = { active: false, status: 'ready', bytesTotal: 394_000_000, bytesDone: 394_000_000, error: null };
  const meloDl = { active: false, status: 'ready', bytesTotal: 191_000_000, bytesDone: 191_000_000, error: null };
  return {
    asrReady: true,
    ttsReady: true,
    asrMissing: [],
    ttsMissing: [],
    asrTotalBytes: 239_549_735,
    ttsTotalBytes: 394_000_000,
    activeTtsModel: 'kokoro',
    ttsModels: [
      { model: 'kokoro', label: 'Kokoro 多角色声线（103 音色）', totalBytes: 394_000_000, ready: true, missing: [] },
      { model: 'melo', label: 'MeloTTS 中英女声（单声低延迟）', totalBytes: 191_000_000, ready: true, missing: [] },
    ],
    downloads: {
      asr: { active: false, status: 'ready', bytesTotal: 239_549_735, bytesDone: 239_549_735, error: null },
      tts: kokoroDl,
      ttsByModel: { kokoro: kokoroDl, melo: meloDl },
    },
    ...overrides,
  };
}

async function mockVoiceRoutes(page: Page) {
  await page.route('**/api/voice/settings', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      Object.assign(voiceSettings, req.postDataJSON());
    }
    await route.fulfill({ json: { success: true, data: { ...voiceSettings } } });
  });
  await page.route('**/api/voice/models/status', async (route) => {
    await route.fulfill({ json: { success: true, data: modelStatus() } });
  });
  await page.route('**/api/voice/models/download', async (route) => {
    await route.fulfill({ json: { success: true, data: { started: true } } });
  });
  await page.route('**/api/voice/asr', async (route) => {
    // 校验录音 WAV 以 multipart 上传（RIFF 头 + 文件名字段）
    const body = route.request().postDataBuffer();
    expect(body?.toString('latin1')).toContain('RIFF');
    expect(route.request().postData()).toContain('speech.wav');
    await route.fulfill({ json: { success: true, data: { text: ASR_TEXT, lang: 'zh' } } });
  });
}

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe.serial('M2 语音输入（ASR）', () => {
  test.beforeEach(async ({ page }) => {
    await mockVoiceRoutes(page);
  });

  test('① 准备对话模型（mock 供应商 + mock-chat）', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: '新增供应商' }).click();
    await page.getByLabel('名称').fill('语音 Mock 供应商');
    await page.getByLabel('Base URL').fill('http://mock.local/v1');
    await page.getByLabel('API Key').fill('sk-voice-mock');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: '语音 Mock 供应商' }).waitFor();

    // 全量 e2e 共享数据根时页面可能有多个供应商卡片，操作范围收敛到新建卡片
    const card = page
      .locator('[data-testid^="provider-card-"]')
      .filter({ hasText: '语音 Mock 供应商' })
      .last();
    await card.locator('[id^="model-id-"]').fill('voice-chat');
    await card.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 voice-chat')).toBeVisible();

    await page.getByLabel('默认对话模型').selectOption({ label: 'voice-chat（voice-chat）' });
    await expect(page.getByText('设置已保存').first()).toBeVisible();
  });

  test('② 语音面板：模型就绪后可开启语音输入', async ({ page }) => {
    await page.goto('/settings');
    const panel = page.getByTestId('voice-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('voice-model-card-asr')).toContainText('已就绪');
    await expect(page.getByTestId('voice-model-card-tts-kokoro')).toContainText('已就绪');
    await expect(page.getByTestId('voice-model-card-tts-melo')).toContainText('已就绪');

    const asrToggle = page.getByLabel(/启用语音输入/);
    await expect(asrToggle).toBeEnabled();
    await asrToggle.check();
    // PUT 已落（③ 的页面读取同一共享状态）
    expect(voiceSettings.asrEnabled).toBe(true);
  });

  test('③ PTT 按住说话：识别文本自动进入对话并收到回复', async ({ page }) => {
    await page.goto('/chat');

    // asrEnabled=true 且模型就绪 → 麦克风按钮可见可用
    const mic = page.getByTestId('mic-button');
    await expect(mic).toBeVisible();
    await expect(mic).toBeEnabled();

    // 按住约 1 秒（fake device 持续产出音频，超过 300ms 最短录音门限）后松开
    await mic.hover();
    await page.mouse.down();
    await expect(mic).toHaveAttribute('data-state', 'recording');
    await page.waitForTimeout(1000);
    await page.mouse.up();

    // 识别中→自动发送：用户消息为 ASR 固定文本，随后 mock 助手回复
    await expect(page.getByText(ASR_TEXT).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/mock 模型/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('④ 关闭语音输入后对话页不再显示麦克风', async ({ page }) => {
    voiceSettings.asrEnabled = false;
    await page.goto('/chat');
    await expect(page.getByTestId('mic-button')).toHaveCount(0);
  });
});
