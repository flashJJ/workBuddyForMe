/**
 * M0 Spike A：sherpa-onnx-node 在 Node（Next 服务端同款运行时）真调用验证。
 *
 * 闭环：MeloTTS 本地合成中文 → 44.1k 重采样 16k → SenseVoice 本地识别。
 * 模型复用 Open-LLM-VTuber 项目已下载并校验过的副本（验证通过后 M1 再做本项目自己的下载器）。
 *
 * 运行：node packages/voice/spikes/spike-sherpa.mjs
 * 不进 src/、不进构建与测试（spike 仅用于技术选型取证）。
 */
import sherpa from 'sherpa-onnx-node';

const MODELS_ROOT = 'E:/code/github/Open-LLM-VTuber-main/models';
const TTS_DIR = `${MODELS_ROOT}/vits-melo-tts-zh_en`;
const ASR_DIR = `${MODELS_ROOT}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17`;

const TEXT = '二零二六年十月六日，Node 绑定语音闭环测试，数字一百二十三。';

console.log('[1/5] sherpa-onnx-node version:', sherpa.version, '| onnxruntime:', sherpa.onnxruntimeVersion);

console.log('[2/5] 初始化离线 TTS（VITS MeloTTS int8）...');
const tts = new sherpa.OfflineTts({
  model: {
    vits: {
      model: `${TTS_DIR}/model.int8.onnx`,
      lexicon: `${TTS_DIR}/lexicon.txt`,
      tokens: `${TTS_DIR}/tokens.txt`,
      dataDir: '',
      dictDir: `${TTS_DIR}/dict`,
    },
    numThreads: 4,
    debug: false,
    provider: 'cpu',
  },
  maxNumSentences: 2,
  ruleFsts: ['number.fst', 'phone.fst', 'date.fst', 'new_heteronym.fst']
    .map((f) => `${TTS_DIR}/${f}`)
    .join(','),
});
console.log('    sampleRate =', tts.sampleRate, '| numSpeakers =', tts.numSpeakers);

const t0 = Date.now();
const generated = tts.generate({ text: TEXT, sid: 0, speed: 1.0 });
console.log(`[3/5] TTS 完成 ${Date.now() - t0}ms, samples=${generated.samples.length}`);

const t1 = Date.now();
const resampler = new sherpa.LinearResampler(tts.sampleRate, 16000);
let pcm16k = resampler.resample(generated.samples);
const tail = resampler.flush(new Float32Array(0));
pcm16k = concatF32(pcm16k, tail);
console.log(`[4/5] 重采样 16k：${pcm16k.length} samples (${(pcm16k.length / 16000).toFixed(2)}s), ${Date.now() - t1}ms`);

const recognizer = new sherpa.OfflineRecognizer({
  modelConfig: {
    senseVoice: {
      model: `${ASR_DIR}/model.int8.onnx`,
      language: '',
      useInverseTextNormalization: 1,
    },
    tokens: `${ASR_DIR}/tokens.txt`,
    numThreads: 4,
    debug: false,
    provider: 'cpu',
  },
});

const t2 = Date.now();
const stream = recognizer.createStream();
stream.acceptWaveform({ sampleRate: 16000, samples: pcm16k });
recognizer.decode(stream);
const result = recognizer.getResult(stream);
console.log(`[5/5] ASR 完成 ${Date.now() - t2}ms`);
console.log('='.repeat(64));
console.log('原文:', TEXT);
console.log('识别:', result.text, '| lang:', result.lang, '| emotion:', result.emotion);
console.log('='.repeat(64));

const ok = result.text.includes('2026') && result.text.includes('123');
console.log(ok ? 'SPIKE A RESULT: PASS' : 'SPIKE A RESULT: REVIEW（数字 ITN 未达预期，需排查）');
process.exit(ok ? 0 : 2);

function concatF32(a, b) {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
