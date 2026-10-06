import { describe, expect, it } from 'vitest';
import { VOICE_MODELS, findMissingFiles, modelFileUrl } from './manifest';

describe('VOICE_MODELS 清单', () => {
  it('ASR/TTS 条目完整且字节数求和正确', () => {
    expect(VOICE_MODELS.asr.files.length).toBeGreaterThanOrEqual(2);
    expect(VOICE_MODELS.tts.files.length).toBe(17);
    const expectedAsr = VOICE_MODELS.asr.files.reduce((s, f) => s + f.size, 0);
    expect(VOICE_MODELS.asr.totalBytes).toBe(expectedAsr);
    expect(VOICE_MODELS.asr.totalBytes).toBeGreaterThan(200_000_000);
  });

  it('TTS 必需的 Jieba 词典与规则 fst 都在清单中', () => {
    const paths = VOICE_MODELS.tts.files.map((f) => f.path);
    for (const required of [
      'model.onnx',
      'tokens.txt',
      'lexicon.txt',
      'dict/jieba.dict.utf8',
      'number.fst',
      'phone.fst',
      'date.fst',
      'new_heteronym.fst',
    ]) {
      expect(paths).toContain(required);
    }
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
