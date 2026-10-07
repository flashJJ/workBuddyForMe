import { describe, expect, it } from 'vitest';
import { VOICE_MODELS, findMissingFiles, modelFileUrl } from './manifest';

describe('VOICE_MODELS 清单', () => {
  it('ASR 条目完整且字节数求和正确', () => {
    expect(VOICE_MODELS.asr.files.length).toBeGreaterThanOrEqual(2);
    const expectedAsr = VOICE_MODELS.asr.files.reduce((s, f) => s + f.size, 0);
    expect(VOICE_MODELS.asr.totalBytes).toBe(expectedAsr);
    expect(VOICE_MODELS.asr.totalBytes).toBeGreaterThan(200_000_000);
  });

  it('TTS 为 Kokoro 多说话人：377 个文件（含 espeak/dict 小文件），总量约 394MB', () => {
    expect(VOICE_MODELS.tts.id).toBe('kokoro-multi-lang-v1_1');
    expect(VOICE_MODELS.tts.files.length).toBe(377);
    const expected = VOICE_MODELS.tts.files.reduce((s, f) => s + f.size, 0);
    expect(VOICE_MODELS.tts.totalBytes).toBe(expected);
    expect(VOICE_MODELS.tts.totalBytes).toBeGreaterThan(390_000_000);
  });

  it('TTS 推理必需文件都在清单中（Kokoro 前端）', () => {
    const paths = VOICE_MODELS.tts.files.map((f) => f.path);
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

  it('大文件带精确字节校验（模型/音色库/词典），路径无重复', () => {
    const byPath = new Map(VOICE_MODELS.tts.files.map((f) => [f.path, f]));
    expect(byPath.size).toBe(VOICE_MODELS.tts.files.length);
    expect(byPath.get('model.onnx')!.size).toBe(325_631_784);
    expect(byPath.get('voices.bin')!.size).toBe(53_790_720);
  });
});

describe('modelFileUrl', () => {
  it('默认走 hf-mirror，关镜像走 huggingface', () => {
    const f = VOICE_MODELS.tts.files[0]!;
    expect(modelFileUrl(VOICE_MODELS.tts, f)).toContain('hf-mirror.com');
    expect(modelFileUrl(VOICE_MODELS.tts, f, false)).toContain('huggingface.co');
    expect(modelFileUrl(VOICE_MODELS.tts, f)).toContain(f.path);
  });
});

describe('findMissingFiles', () => {
  it('全部齐备返回空数组', async () => {
    const stat = async () => 12345;
    const missing = await findMissingFiles(
      { ...VOICE_MODELS.tts, files: [{ path: 'a.txt', size: 12345 }] },
      stat,
    );
    expect(missing).toEqual([]);
  });

  it('size=0 的小文件只校验存在性（espeak/dict 数据）', async () => {
    const stat = async () => 0;
    const missing = await findMissingFiles(
      { ...VOICE_MODELS.tts, files: [{ path: 'espeak-ng-data/af_dict', size: 0 }] },
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
