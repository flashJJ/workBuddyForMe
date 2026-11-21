import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createAssistantsService } from './assistant-service';
import { createConversationService } from './conversation-service';

describe('v4.18 会话 token 预算持久化', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-budget-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('设置、读取、取消预算均走 settings_kv，不新增数据库列', () => {
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const conversations = createConversationService({ db, cipher });
    const conversation = conversations.create(assistant.id, '预算测试');

    expect(conversations.get(conversation.id).tokenBudget).toBeNull();
    expect(conversations.update(conversation.id, { tokenBudget: 50_000 }).tokenBudget).toBe(50_000);
    expect(conversations.get(conversation.id).tokenBudget).toBe(50_000);
    expect(conversations.list(assistant.id)[0]!.tokenBudget).toBe(50_000);
    expect(conversations.tokenBudget(conversation.id)).toBe(50_000);

    expect(conversations.update(conversation.id, { tokenBudget: null }).tokenBudget).toBeNull();
    expect(conversations.tokenBudget(conversation.id)).toBeNull();
  });
});
