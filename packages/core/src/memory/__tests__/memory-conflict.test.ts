import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, upsertMemoryFts, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createMemoryService } from '../memory-service';
import { resolveEmbeddingTarget } from '../../ingestion/embedding-target';

vi.mock('../../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

describe('v4.21 召回冲突 golden', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
    vi.mocked(resolveEmbeddingTarget).mockReturnValue(null);
  });

  function insert(input: {
    content: string;
    subjectKey: string;
    pinned?: boolean;
    confidence?: number;
    lastConfirmedAt: string;
  }): number {
    const info = db
      .prepare(
        `INSERT INTO memories(kind, content, importance, status, scope, source, pinned,
           confidence, subject_key, version, created_at, updated_at, last_confirmed_at)
         VALUES ('fact', ?, 0.7, 'active', 'global', 'manual', ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        input.content,
        input.pinned ? 1 : 0,
        input.confidence ?? 1,
        input.subjectKey,
        input.lastConfirmedAt,
        input.lastConfirmedAt,
        input.lastConfirmedAt,
      );
    const id = Number(info.lastInsertRowid);
    upsertMemoryFts(db, { id, content: input.content });
    return id;
  }

  it('同主体只注入胜者，落选值仍可查询', async () => {
    insert({
      content: '用户住在北京',
      subjectKey: 'residence:city',
      pinned: true,
      lastConfirmedAt: '2024-01-01T00:00:00.000Z',
    });
    insert({
      content: '用户住在上海',
      subjectKey: 'residence:city',
      pinned: true,
      lastConfirmedAt: '2026-06-01T00:00:00.000Z',
    });

    const memory = createMemoryService({ db, cipher });
    const recalled = await memory.recall({ query: '用户' });

    expect(recalled.map((item) => item.content)).toEqual(['用户住在上海']);
    // 落选值没有被删除，管理页仍能查到
    expect(memory.list()).toHaveLength(2);
  });
});
