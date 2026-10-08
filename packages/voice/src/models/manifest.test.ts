import { describe, expect, it } from 'vitest';
import { VOICE_MODELS, findMissingFiles, getVoiceModelSpec, modelFileUrl } from './manifest';

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

  it('TTS 提供两套引擎：melo + kokoro，且各带 engine 标记', () => {
    expect(ttsList).toHaveLength(2);
    expect(ttsList.map((m) => m.engine).sort()).toEqual(['kokoro', 'melo']);
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
    expect(kokoroByPath.get('model.onnx')!.size).toBe(325_631_784);
    expect(kokoroByPath.get('voices.bin')!.size).toBe(53_790_720);

    const meloByPath = new Map(melo.files.map((f) => [f.path, f]));
    expect(meloByPath.size).toBe(melo.files.length);
    expect(meloByPath.get('model.onnx')!.size).toBe(170_429_550);
  });
});

describe('getVoiceModelSpec', () => {
  it('缺省与未知引擎回落 Kokoro；显式 melo 返回 VITS 规格', () => {
    expect(getVoiceModelSpec('tts').id).toBe('kokoro-multi-lang-v1_1');
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
  it('默认走 hf-mirror，关镜像走 huggingface', () => {
    const f = kokoro.files[0]!;
    expect(modelFileUrl(kokoro, f)).toContain('hf-mirror.com');
    expect(modelFileUrl(kokoro, f, false)).toContain('huggingface.co');
    expect(modelFileUrl(kokoro, f)).toContain(f.path);
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
