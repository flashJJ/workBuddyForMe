/**
 * Next 服务启动钩子：预热本地 TTS 引擎。
 *
 * 合成已挪进 worker 线程，但冷启动仍要加载模型（Kokoro 数百 MB）；不预热时
 * 第一句朗读会额外背一次加载耗时。模型未下载时 prewarmTts 自行跳过。
 *
 * 仅 Node runtime 执行；排障/低内存机器可用 WBFM_DISABLE_VOICE_PREWARM=1 关闭。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WBFM_DISABLE_VOICE_PREWARM === '1') return;

  // 故意不 await：预热是纯优化，不能拖慢服务启动，失败也不影响任何接口
  void (async () => {
    const { getVoiceRuntime } = await import('@/lib/server/voice/voice-runtime-singleton');
    await getVoiceRuntime().prewarmTts();
  })().catch((error: unknown) => {
    console.warn('[voice:tts] 启动预热异常：', (error as Error).message);
  });
}
