import { createDatabase } from '../client';
import { createVoiceModelRepository } from './voice-model-repo';
import { beforeEach, describe, expect, it } from 'vitest';

describe('voice-model-repo（v014）', () => {
  let db: ReturnType<typeof createDatabase>;
  let repo: ReturnType<typeof createVoiceModelRepository>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = createVoiceModelRepository(db);
  });

  it('未记录返回 null', () => {
    expect(repo.get('tts', 'vits-melo-tts-zh_en')).toBeNull();
  });

  it('下载中 → 进度 → 就绪 的状态流转', () => {
    repo.markDownloading('tts', 'melo', 100, 0);
    expect(repo.get('tts', 'melo')?.status).toBe('downloading');
    repo.markProgress('tts', 'melo', 40, 100);
    expect(repo.get('tts', 'melo')?.bytesDone).toBe(40);
    repo.markReady('tts', 'melo', 100);
    const state = repo.get('tts', 'melo');
    expect(state?.status).toBe('ready');
    expect(state?.bytesDone).toBe(100);
    expect(state?.error).toBeNull();
  });

  it('错误态记录原因且 bytesDone 归零', () => {
    repo.markDownloading('tts', 'melo', 100, 30);
    repo.markError('tts', 'melo', 'network reset', 100);
    const state = repo.get('tts', 'melo');
    expect(state).toMatchObject({ status: 'error', bytesDone: 0, error: 'network reset' });
  });

  it('asr/tts 同 modelId 不冲突（复合主键）', () => {
    repo.markReady('asr', 'x', 10);
    repo.markReady('tts', 'x', 20);
    expect(repo.get('asr', 'x')?.bytesTotal).toBe(10);
    expect(repo.get('tts', 'x')?.bytesTotal).toBe(20);
  });
});
