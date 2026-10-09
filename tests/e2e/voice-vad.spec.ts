import { expect, test, type Page } from '@playwright/test';

/**
 * M4 免手持续聆听（VAD）E2E：
 * - /api/voice/* 拦截：模型恒就绪、ASR 恒返回固定文本（同 M2 策略）；
 * - 不依赖假麦克风的真实电平（fake device 默认近静音，VAD 永不触发），
 *   改为路由替换 vad-capture.worklet.js：确定性地产出「校准静音→语音→尾静音」
 *   帧序列，覆盖 AudioWorkletNode→检测器→段缓冲→ASR→自动发送的真实接线；
 * - 回声门控/打断的算法正确性由纯函数与 hook 单测密集覆盖，真机打断在 M4-6 验收。
 */

const ASR_TEXT = '这是免手模式自动发送的一句话';

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
  avatarModelId: 'haru',
  petEnabled: false,
  petClickThrough: false,
  proactiveEnabled: false,
  proactiveIdleSeconds: 300,
};

const voiceSettings = { ...DEFAULT_SETTINGS };

function modelStatus() {
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
  };
}

/**
 * 假 AudioWorklet 环境（addInitScript，在应用脚本前注入）：
 * Playwright 无法稳定拦截 addModule 的内部模块加载，fake mic 默认近静音，
 * 因此直接桩掉 AudioWorkletNode：addModule 空成功；节点收到 wbfm:start 握手后
 * 异步产出「25 帧校准静音(0.008)→12 帧语音(0.1)→40 帧尾静音(0.001)」，
 * 覆盖检测器→段缓冲→ASR→自动发送的真实接线（算法本身由纯函数单测覆盖）。
 */
const FAKE_WORKLET_ENV = `(() => {
  // serial 用例在同一 context 多次 addInitScript：只允许首个生效，避免原型被反复改写
  if (window.__vadEnvPatched) return;
  window.__vadEnvPatched = true;
  window.__vadFrames = 0;
  window.__vadStarts = 0;
  class FakePort {
    constructor() { this._h = null; }
    set onmessage(h) { this._h = h; }
    get onmessage() { return this._h; }
    start() {}
    addEventListener() {}
    removeEventListener() {}
    postMessage(msg) {
      if (!msg || msg.type !== 'wbfm:start') return;
      window.__vadStarts += 1;
      let i = 0;
      const total = 77;
      const emit = (rms) => {
        const pcm = new Float32Array(512).fill(rms);
        window.__vadFrames += 1;
        if (this._h) this._h({ data: { rms, pcm16k: pcm.buffer } });
      };
      const tick = () => {
        for (let k = 0; k < 8 && i < total; k += 1, i += 1) {
          emit(i < 25 ? 0.008 : i < 37 ? 0.1 : 0.001);
        }
        if (i < total) setTimeout(tick, 0);
      };
      setTimeout(tick, 0);
    }
  }
  class FakeWorkletNode {
    constructor() { this.port = new FakePort(); }
    connect() {}
    disconnect() {}
    addEventListener() {}
  }
  window.AudioWorkletNode = FakeWorkletNode;
  const RealAudioContext = window.AudioContext || window.webkitAudioContext;
  if (RealAudioContext) {
    // 包装构造器：实例级覆盖（原型方法赋值在部分环境被原生描述符吞掉）
    const PatchedAudioContext = function PatchedAudioContext() {
      const ctx = new RealAudioContext();
      Object.defineProperty(ctx, 'audioWorklet', {
        configurable: true,
        value: { addModule: () => Promise.resolve() },
      });
      ctx.createMediaStreamSource = () => ({ connect() {}, disconnect() {} });
      return ctx;
    };
    PatchedAudioContext.prototype = RealAudioContext.prototype;
    window.AudioContext = PatchedAudioContext;
    window.webkitAudioContext = PatchedAudioContext;
  }
})();`;

async function mockVoiceRoutes(page: Page) {
  await page.route('**/api/voice/settings', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT') Object.assign(voiceSettings, req.postDataJSON());
    await route.fulfill({ json: { success: true, data: { ...voiceSettings } } });
  });
  await page.route('**/api/voice/models/status', async (route) => {
    await route.fulfill({ json: { success: true, data: modelStatus() } });
  });
  await page.route('**/api/voice/models/download', async (route) => {
    await route.fulfill({ json: { success: true, data: { started: true } } });
  });
  await page.route('**/api/voice/asr', async (route) => {
    const body = route.request().postDataBuffer();
    expect(body?.toString('latin1')).toContain('RIFF');
    await route.fulfill({ json: { success: true, data: { text: ASR_TEXT, lang: 'zh' } } });
  });
}

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe.serial('M4 免手持续聆听（VAD）', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(FAKE_WORKLET_ENV);
    await mockVoiceRoutes(page);
  });

  test('① 准备对话模型（mock 供应商 + vad-chat）', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: '新增供应商' }).click();
    await page.getByLabel('名称').fill('VAD Mock 供应商');
    await page.getByLabel('Base URL').fill('http://mock.local/v1');
    await page.getByLabel('API Key').fill('sk-vad-mock');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: 'VAD Mock 供应商' }).waitFor();

    const card = page
      .locator('[data-testid^="provider-card-"]')
      .filter({ hasText: 'VAD Mock 供应商' })
      .last();
    await card.locator('[id^="model-id-"]').fill('vad-chat');
    await card.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 vad-chat')).toBeVisible();
    await page.getByLabel('默认对话模型').selectOption({ label: 'vad-chat（vad-chat）' });
    await expect(page.getByText('设置已保存').first()).toBeVisible();
  });

  test('② 设置面板：开启语音输入并切到免手模式（PUT 落库）', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel(/启用语音输入/).check();
    expect(voiceSettings.asrEnabled).toBe(true);

    const vadButton = page.getByTestId('voice-input-mode-vad');
    await expect(vadButton).toBeVisible();
    await vadButton.click();
    expect(voiceSettings.inputMode).toBe('vad');
    // 选中态 + 高级参数展开
    await expect(vadButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('voice-vad-params')).toBeVisible();
    await expect(page.getByTestId('voice-vad-sensitivity')).toHaveValue('balanced');
  });

  test('③ 免手武装后自动聆听：VAD 段→ASR→消息自动发送并收到回复', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByLabel('消息输入框')).toBeVisible();

    // 免手开关渲染且默认未武装
    const handsfree = page.getByTestId('handsfree-button');
    await expect(handsfree).toBeVisible();
    await expect(handsfree).toHaveAttribute('data-state', 'off');

    // 武装即触发麦克风/worklet，假帧序列自动完成「聆听→识别→发送」
    await handsfree.click();
    await expect(handsfree).toHaveAttribute('aria-pressed', 'true');

    const asrReq = await page.waitForRequest((r) => r.url().includes('/api/voice/asr'), {
      timeout: 30_000,
    });
    expect(asrReq.method()).toBe('POST');

    await expect(page.getByText(ASR_TEXT).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/mock 模型/).first()).toBeVisible({ timeout: 30_000 });

    // 用完可关闭（关闭即停采集，下一例切回 PTT 验证按钮互换）
    await handsfree.click();
    await expect(handsfree).toHaveAttribute('data-state', 'off');
  });

  test('④ PTT 回归：切回按住说话后免手按钮消失、PTT 按钮出现', async ({ page }) => {
    voiceSettings.inputMode = 'ptt';
    await page.goto('/chat');
    await expect(page.getByTestId('handsfree-button')).toHaveCount(0);
    await expect(page.getByTestId('mic-button')).toBeVisible();
  });
});
