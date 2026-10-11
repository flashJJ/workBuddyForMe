import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { Assistant } from '@wbfm/shared/types';
import { ApiError } from '@wbfm/shared/errors';
import { createWebCipher } from '../secrets/cipher';
import { resolveRoleTarget, targetHasVision } from './role-models';

function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: 'a1',
    name: '助手',
    emoji: null,
    color: null,
    systemPrompt: '',
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    plannerModelId: null,
    executorModelId: null,
    reviewerModelId: null,
    knowledgeBaseId: null,
    enabledTools: [],
    retrieveAlways: true,
    memoryEnabled: true,
    expressionEnabled: true,
    isBuiltin: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('resolveRoleTarget 角色模型三级回落（T2.4）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-role-models-')));
    db = createDatabase(':memory:');
    db.prepare(
      `INSERT INTO providers(id,name,base_url,enabled,created_at,updated_at)
       VALUES('p1','供应','http://x',1,'t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO models(id,provider_id,model_id,display_name,capabilities,created_at)
       VALUES ('m-general','p1','general','通用','["chat"]','t'),
              ('m-planner','p1','planner-m','规划','["chat"]','t'),
              ('m-vision','p1','vl','视觉','["chat","vision"]','t')`,
    ).run();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const deps = () => ({ db, cipher: createWebCipher() });

  it('第一级：显式 modelId 优先于角色覆盖与助手通用模型', () => {
    const assistant = makeAssistant({ modelId: 'm-general', plannerModelId: 'm-planner' });
    const target = resolveRoleTarget(deps(), assistant, 'planner', { explicitModelId: 'm-vision' });
    expect(target.model.modelId).toBe('vl');
  });

  it('第二级：角色覆盖（planner/executor/reviewer 各取各列）', () => {
    const assistant = makeAssistant({
      modelId: 'm-general',
      plannerModelId: 'm-planner',
      executorModelId: 'm-vision',
    });
    expect(resolveRoleTarget(deps(), assistant, 'planner').model.modelId).toBe('planner-m');
    expect(resolveRoleTarget(deps(), assistant, 'executor').model.modelId).toBe('vl');
    expect(resolveRoleTarget(deps(), assistant, 'reviewer').model.modelId).toBe('general');
  });

  it('第三级：角色留空回落助手通用 modelId，再回落系统默认对话模型', () => {
    expect(resolveRoleTarget(deps(), makeAssistant({ modelId: 'm-general' }), 'reviewer').model.modelId)
      .toBe('general');

    db.prepare(
      `INSERT INTO settings_kv(key,value,updated_at) VALUES('app-settings',
       '{"defaultChatModelId":"m-planner"}','t')`,
    ).run();
    expect(resolveRoleTarget(deps(), makeAssistant(), 'reviewer').model.modelId).toBe('planner-m');
  });

  it('全无配置时抛 422；视觉门控按 capabilities 判断', () => {
    expect(() => resolveRoleTarget(deps(), makeAssistant(), 'planner')).toThrow(ApiError);
    expect(targetHasVision(resolveRoleTarget(deps(), makeAssistant({ executorModelId: 'm-vision' }), 'executor')))
      .toBe(true);
    expect(targetHasVision(resolveRoleTarget(deps(), makeAssistant({ modelId: 'm-general' }), 'executor')))
      .toBe(false);
  });
});
