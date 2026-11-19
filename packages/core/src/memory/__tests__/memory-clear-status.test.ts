import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createMemoryService } from '../memory-service';

vi.mock('../../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(() => null),
}));

describe('memory clearByStatus（v4.12）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  it('只清理指定状态，保留其它记忆', async () => {
    const memory = createMemoryService({ db, cipher });
    const active = await memory.createManual({ kind: 'fact', content: '保留', importance: 0.5 });
    const archived = await memory.createManual({ kind: 'event', content: '归档', importance: 0.5 });
    memory.update(archived.id, { status: 'archived' });

    expect(memory.clearByStatus('archived')).toBe(1);
    expect(memory.get(archived.id)).toBeNull();
    expect(memory.get(active.id)?.content).toBe('保留');
    expect(memory.list({ status: 'archived' })).toEqual([]);
  });
});
