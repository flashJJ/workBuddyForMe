import { describe, expect, it } from 'vitest';
import {
  VOICE_MODELS,
  findFileIssues,
  findMissingFiles,
  getVoiceModelSpec,
  modelFileUrl,
  KOKORO_REVISION,
} from './manifest';

const ttsList = VOICE_MODELS.tts;
const kokoro = getVoiceModelSpec('tts', 'kokoro');
const melo = getVoiceModelSpec('tts', 'melo');

describe('VOICE_MODELS 清单', () => {
  it('ASR 条目完整且字节数求和正确', () => {
    expect(VOICE_MODELS.asr.files.length).toBeGreaterThanOrEqual(2);
    const expectedAsr = VOICE_MODELS.asr.files.reduce((s, f) => s + f.size, 0);
    expect(VOICE_MODELS.asr.totalBytes).toBe(expectedAsr);
    expect(VOICE_MODELS.asr.totalBytes).toBeGreaterThan(200_000_000);
  });

  it('TTS 提供三套引擎：melo + kokoro + matcha，且各带 engine 标记', () => {
    expect(ttsList).toHaveLength(3);
    expect(ttsList.map((m) => m.engine).sort()).toEqual(['kokoro', 'matcha', 'melo']);
    for (const spec of ttsList) {
      const expected = spec.files.reduce((s, f) => s + f.size, 0);
      expect(spec.totalBytes).toBe(expected);
    }
  });

  it('Kokoro：377 个文件（含 espeak/dict 小文件），总量约 394MB', () => {
    expect(kokoro.id).toBe('kokoro-multi-lang-v1_1');
    expect(kokoro.files.length).toBe(377);
    expect(kokoro.totalBytes).toBeGreaterThan(390_000_000);
  });

  it('Kokoro 推理必需文件都在清单中', () => {
    const paths = kokoro.files.map((f) => f.path);
    for (const required of [
      'model.onnx',
      'tokens.txt',
      'voices.bin',
      'espeak-ng-data/phontab',
      'lexicon-us-en.txt',
      'lexicon-zh.txt',
      'dict/jieba.dict.utf8',
      'date-zh.fst',
      'number-zh.fst',
      'phone-zh.fst',
    ]) {
      expect(paths).toContain(required);
    }
  });

  it('MeloTTS：fp32 VITS + jieba dict + 中文四件套 fst，总量约 191MB', () => {
    expect(melo.id).toBe('vits-melo-tts-zh_en');
    expect(melo.totalBytes).toBeGreaterThan(180_000_000);
    const paths = melo.files.map((f) => f.path);
    for (const required of [
      'model.onnx',
      'tokens.txt',
      'lexicon.txt',
      'dict/jieba.dict.utf8',
      'dict/hmm_model.utf8',
      'date.fst',
      'number.fst',
      'phone.fst',
      'new_heteronym.fst',
    ]) {
      expect(paths).toContain(required);
    }
  });

  it('大文件带精确字节校验（模型/音色库/词典），各清单路径无重复', () => {
    const kokoroByPath = new Map(kokoro.files.map((f) => [f.path, f]));
    expect(kokoroByPath.size).toBe(kokoro.files.length);
    expect(kokoro.revision).toBe(KOKORO_REVISION);
    expect(kokoroByPath.get('model.onnx')!.size).toBe(325_561_476);
    expect(kokoroByPath.get('model.onnx')!.sha256).toBe(
      '99db0bc8fd0c5033d249fe922db16768b71b4a6b26cfd93d206fbf66c76efb5f',
    );
    expect(kokoroByPath.get('lexicon-zh.txt')!.size).toBe(2_120_131);
    expect(kokoroByPath.get('lexicon-zh.txt')!.sha256).toBe(
      'fea060803db3e59193987f1a3436f56917bda09f3b3595b6588e46ae60cebf93',
    );
    expect(kokoroByPath.get('voices.bin')!.size).toBe(53_790_720);
    expect(kokoroByPath.get('voices.bin')!.sha256).toBe(
      'e64a5a581d8c2a350d848f51c3121657cd83aa07ed6109172177345874a7244c',
    );

    const meloByPath = new Map(melo.files.map((f) => [f.path, f]));
    expect(meloByPath.size).toBe(melo.files.length);
    expect(meloByPath.get('model.onnx')!.size).toBe(170_429_550);
  });
});

describe('getVoiceModelSpec', () => {
  it('缺省回落 MeloTTS（D9 默认）；显式 kokoro/melo 各返回对应规格', () => {
    expect(getVoiceModelSpec('tts').id).toBe('vits-melo-tts-zh_en');
    expect(getVoiceModelSpec('tts', 'kokoro').id).toBe('kokoro-multi-lang-v1_1');
    expect(getVoiceModelSpec('tts', 'melo').id).toBe('vits-melo-tts-zh_en');
  });

  it('asr 固定返回 SenseVoice（engine 参数不影响）', () => {
    expect(getVoiceModelSpec('asr', 'melo').id).toBe(
      'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    );
  });
});

describe('modelFileUrl', () => {
  it('默认走 hf-mirror，显式基址走官方，URL 固定 revision', () => {
    const f = kokoro.files[0]!;
    const mirrorUrl = modelFileUrl(kokoro, f);
    expect(mirrorUrl).toContain('hf-mirror.com');
    expect(mirrorUrl).toContain(`/resolve/${KOKORO_REVISION}/`);
    expect(mirrorUrl).toContain(f.path);
    expect(modelFileUrl(kokoro, f, 'https://huggingface.co')).toContain('huggingface.co');
    expect(modelFileUrl(melo, melo.files[0]!)).toContain('/resolve/main/');
  });
});

describe('findFileIssues', () => {
  it('全部齐备返回空分类', async () => {
    const issues = await findFileIssues(
      { ...melo, files: [{ path: 'a.txt', size: 12345 }] },
      async () => 12345,
    );
    expect(issues).toEqual({ missing: [], sizeMismatch: [], hashMismatch: [] });
  });

  it('区分缺失、大小不符、哈希不符', async () => {
    const spec = {
      ...melo,
      files: [
        { path: 'missing.bin', size: 10 },
        { path: 'size.bin', size: 10 },
        { path: 'hash.bin', size: 10, sha256: 'aa' },
      ],
    };
    const sizes: Record<string, number | null> = {
      'missing.bin': null,
      'size.bin': 9,
      'hash.bin': 10,
    };
    const issues = await findFileIssues(
      spec,
      async (rel) => sizes[rel] ?? null,
      async () => 'bb',
    );
    expect(issues.missing).toEqual(['missing.bin']);
    expect(issues.sizeMismatch).toEqual(['size.bin']);
    expect(issues.hashMismatch).toEqual(['hash.bin']);
  });

  it('哈希一致时不报错', async () => {
    const issues = await findFileIssues(
      { ...melo, files: [{ path: 'a.bin', size: 3, sha256: 'aa' }] },
      async () => 3,
      async () => 'AA',
    );
    expect(issues.hashMismatch).toEqual([]);
  });
});

describe('findMissingFiles', () => {
  it('全部齐备返回空数组', async () => {
    const stat = async () => 12345;
    const missing = await findMissingFiles(
      { ...melo, files: [{ path: 'a.txt', size: 12345 }] },
      stat,
    );
    expect(missing).toEqual([]);
  });

  it('size=0 的小文件只校验存在性（espeak/dict 数据）', async () => {
    const stat = async () => 0;
    const missing = await findMissingFiles(
      { ...kokoro, files: [{ path: 'espeak-ng-data/af_dict', size: 0 }] },
      stat,
    );
    expect(missing).toEqual([]);
  });

  it('缺失与大小不符都能识别', async () => {
    const stat = async (rel: string) => (rel === 'tokens.txt' ? 1 : null);
    const missing = await findMissingFiles(
      { ...VOICE_MODELS.asr, files: [
        { path: 'tokens.txt', size: 315_894 },
        { path: 'model.int8.onnx', size: 239_233_841 },
      ] },
      stat,
    );
    expect(missing).toEqual(['tokens.txt', 'model.int8.onnx']);
  });
});
