/**
 * M4.5 Spike B：Kokoro 多说话人（kokoro-multi-lang-v1_1）真机声线绑定验证。
 *
 * 闭环：按生产同款 OfflineTts 配置加载模型 → 校验 numSpeakers=103 →
 * 为 5 个内置角色的绑定 sid 各合成一句中文 → 写 WAV 供人耳试听选角。
 *
 * 运行：node packages/voice/spikes/spike-kokoro-voices.mjs
 * 输出：%TEMP%/wbfm-kokoro-audition/*.wav
 * 不进 src/、不进构建与测试（spike 仅用于技术选型/声线试听取证）。
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import sherpa from 'sherpa-onnx-node';

const MODEL_DIR = path.join(
  os.homedir(),
  '.workbuddy-for-me',
  'models',
  'voice',
  'kokoro-multi-lang-v1_1',
);
const OUT_DIR = path.join(os.tmpdir(), 'wbfm-kokoro-audition');

// 与 packages/shared AVATAR_TTS_VOICES 保持一致（spike 不引 TS 源，手工对齐）
const ROLES = [
  { role: 'haru', sid: 3, voice: 'zf_001' },
  { role: 'hiyori', sid: 18, voice: 'zf_026' },
  { role: 'mark', sid: 58, voice: 'zm_009' },
  { role: 'mao', sid: 32, voice: 'zf_049' },
  { role: 'wanko', sid: 59, voice: 'zm_010' },
];

// 同一句文本对比音色；含日期/数字以走 date-zh/number-zh 规整 FST
const TEXT = '你好，我是你的桌面伙伴。今天是二零二六年十月八日，很高兴见到你，我们一起加油吧！';

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('[1/3] sherpa-onnx-node:', sherpa.version, '| 初始化 Kokoro（多说话人 fp32）...');
const t0 = Date.now();
const tts = new sherpa.OfflineTts({
  model: {
    kokoro: {
      model: path.join(MODEL_DIR, 'model.onnx'),
      voices: path.join(MODEL_DIR, 'voices.bin'),
      tokens: path.join(MODEL_DIR, 'tokens.txt'),
      dataDir: path.join(MODEL_DIR, 'espeak-ng-data'),
      lexicon: [
        path.join(MODEL_DIR, 'lexicon-us-en.txt'),
        path.join(MODEL_DIR, 'lexicon-zh.txt'),
      ].join(','),
    },
  },
  numThreads: 4,
  debug: false,
  provider: 'cpu',
  // Kokoro 前端强制 maxNumSentences=1（传 2 会被原生层忽略，且每次 generate 刷一条
  // "max_num_sentences (2) != 1 is ignored" 原生告警）；与生产 tts-engine.ts 保持一致
  maxNumSentences: 1,
  ruleFsts: ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst']
    .map((f) => path.join(MODEL_DIR, f))
    .join(','),
});
// 说明：构造阶段原生层可能打印一次 "Unknown token: ❓"——与输入/FST 无关（不传 FST、
// 不合成也会出现），是 kokoro-multi-lang-v1_1 与 sherpa-onnx 1.13.8 加载期的内部提示，
// numSpeakers 与后续合成都正常，无需处理。
console.log(`    加载 ${Date.now() - t0}ms | sampleRate=${tts.sampleRate} numSpeakers=${tts.numSpeakers}`);

if (tts.numSpeakers !== 103) {
  console.error(`SPIKE B RESULT: FAIL（期望 103 speakers，实际 ${tts.numSpeakers}）`);
  process.exit(2);
}

console.log('[2/3] 逐角色合成（同一句中文）...');
const results = [];
for (const r of ROLES) {
  const t1 = Date.now();
  const audio = tts.generate({ text: TEXT, sid: r.sid, speed: 1.0 });
  const secs = audio.samples.length / audio.sampleRate;
  const file = path.join(OUT_DIR, `${r.role}_sid${r.sid}_${r.voice}.wav`);
  writeWav(file, audio.samples, audio.sampleRate);
  results.push({ ...r, secs, ms: Date.now() - t1, file });
  console.log(`    ${r.role.padEnd(7)} sid=${String(r.sid).padStart(3)} ${r.voice} -> ${secs.toFixed(2)}s 音频 / ${Date.now() - t1}ms`);
}

console.log('[3/3] 英文抽查（zf_001 读英文句，验证多语种前端）...');
// 注：espeak 偶发输出 Kokoro 音素表没有的音标时，原生层打印
// "Skip unknown phonemes"（如 U+025A），仅跳过该音标、音频正常，非错误。
const en = tts.generate({
  text: 'Hello! This is an offline text to speech demo running entirely on your machine.',
  sid: ROLES[0].sid,
  speed: 1.0,
});
const enFile = path.join(OUT_DIR, `haru_sid3_english.wav`);
writeWav(enFile, en.samples, en.sampleRate);
console.log(`    -> ${(en.samples.length / en.sampleRate).toFixed(2)}s 音频`);

tts.free?.();
console.log('='.repeat(72));
console.log('SPIKE B RESULT: PASS（numSpeakers=103，5 角色 sid 全部可合成）');
console.log('试听目录:', OUT_DIR);
for (const r of results) console.log('  ', r.file);
console.log('  ', enFile);
process.exit(0);

/** 手写 16-bit PCM WAV（避免依赖绑定是否导出 writeWave） */
function writeWav(file, samples, sampleRate) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}
