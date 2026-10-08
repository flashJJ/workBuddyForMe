/**
 * 严谨基准：单引擎 × 5 次合成取中位数（进程参数由命令行传入）。
 * 用法：node bench-kokoro-stable.mjs <threads> <variant(fp32|int8)>
 */
import os from 'node:os';
import path from 'node:path';
import sherpa from 'sherpa-onnx-node';

const threads = Number(process.argv[2] ?? 4);
const variant = process.argv[3] ?? 'fp32';
const cfg =
  variant === 'int8'
    ? { dir: 'kokoro-int8-multi-lang-v1_1', modelFile: 'model.int8.onnx' }
    : { dir: 'kokoro-multi-lang-v1_1', modelFile: 'model.onnx' };

const d = path.join(os.homedir(), '.workbuddy-for-me', 'models', 'voice', cfg.dir);
const tts = new sherpa.OfflineTts({
  model: {
    kokoro: {
      model: path.join(d, cfg.modelFile),
      voices: path.join(d, 'voices.bin'),
      tokens: path.join(d, 'tokens.txt'),
      dataDir: path.join(d, 'espeak-ng-data'),
      lexicon: [path.join(d, 'lexicon-us-en.txt'), path.join(d, 'lexicon-zh.txt')].join(','),
    },
  },
  numThreads: threads,
  debug: false,
  provider: 'cpu',
  maxNumSentences: 1,
  ruleFsts: ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst'].map((f) => path.join(d, f)).join(','),
});

const CASES = [
  ['short12', '你好呀，我在这儿呢。'],
  ['clause20', '这个问题问得很好，让我来帮你分析一下。'],
  ['long38', '你好，我是你的桌面伙伴。今天是二零二六年十月八日，很高兴见到你，我们一起加油吧！'],
];

// 预热
tts.generate({ text: CASES[0][1], sid: 3, speed: 1.0 });

for (const [tag, text] of CASES) {
  const times = [];
  let audioS = 0;
  for (let i = 0; i < 5; i += 1) {
    const t = performance.now();
    const audio = tts.generate({ text, sid: 3, speed: 1.0 });
    times.push(performance.now() - t);
    audioS = audio.samples.length / audio.sampleRate;
  }
  times.sort((a, b) => a - b);
  const med = Math.round(times[2]);
  const min = Math.round(times[0]);
  const max = Math.round(times[4]);
  console.log(
    `${variant} t=${String(threads).padStart(2)} ${tag.padEnd(8)} median=${String(med).padStart(6)}ms min=${String(min).padStart(6)} max=${String(max).padStart(6)} audio=${audioS.toFixed(2)}s RTF=${(med / 1000 / audioS).toFixed(2)}`,
  );
}
tts.free?.();
process.exit(0);
