/**
 * 同机对照：MeloTTS（旧 v1.0 M1 引擎）当前 RTF，判别「Kokoro 慢」还是「整机慢」。
 * 用法：node packages/voice/spikes/bench-melo-compare.mjs [threads]
 */
import os from 'node:os';
import path from 'node:path';
import sherpa from 'sherpa-onnx-node';

const threads = Number(process.argv[2] ?? 4);
const d = path.join(os.homedir(), '.workbuddy-for-me', 'models', 'voice', 'vits-melo-tts-zh_en');
const tts = new sherpa.OfflineTts({
  model: {
    vits: {
      model: path.join(d, 'model.onnx'),
      lexicon: path.join(d, 'lexicon.txt'),
      tokens: path.join(d, 'tokens.txt'),
      dataDir: '',
      dictDir: path.join(d, 'dict'),
    },
  },
  numThreads: threads,
  debug: false,
  provider: 'cpu',
  maxNumSentences: 2,
  ruleFsts: ['number.fst', 'phone.fst', 'date.fst', 'new_heteronym.fst']
    .map((f) => path.join(d, f))
    .join(','),
});

const CASES = [
  ['short12', '你好呀，我在这儿呢。'],
  ['clause20', '这个问题问得很好，让我来帮你分析一下。'],
  ['long38', '你好，我是你的桌面伙伴。今天是二零二六年十月八日，很高兴见到你，我们一起加油吧！'],
];
tts.generate({ text: CASES[0][1], sid: 0, speed: 1.0 });
for (const [tag, text] of CASES) {
  const times = [];
  let audioS = 0;
  for (let i = 0; i < 5; i += 1) {
    const t = performance.now();
    const audio = tts.generate({ text, sid: 0, speed: 1.0 });
    times.push(performance.now() - t);
    audioS = audio.samples.length / audio.sampleRate;
  }
  times.sort((a, b) => a - b);
  const med = Math.round(times[2]);
  console.log(`melo t=${String(threads).padStart(2)} ${tag.padEnd(8)} median=${String(med).padStart(6)}ms audio=${audioS.toFixed(2)}s RTF=${(med / 1000 / audioS).toFixed(2)}`);
}
tts.free?.();
process.exit(0);
