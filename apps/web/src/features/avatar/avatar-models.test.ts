import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_AVATAR_MODEL_IDS } from '@wbfm/shared';
import { AVATAR_MODELS, AVATAR_MODEL_LIST, getAvatarModel } from './avatar-models';
import { EXPRESSION_TAGS } from './expression-parser';

const MODELS_DIR = path.join(process.cwd(), 'public', 'live2d', 'models');

interface Model3File {
  FileReferences: {
    Expressions?: Array<{ Name: string; File: string }>;
    Motions?: Record<string, unknown[]>;
    Textures?: string[];
  };
}

describe('avatar-models 注册表', () => {
  it('注册表与白名单完全一致（顺序以白名单为准，默认 haru）', () => {
    expect(AVATAR_MODEL_LIST.map((m) => m.id)).toEqual([...SUPPORTED_AVATAR_MODEL_IDS]);
    expect(SUPPORTED_AVATAR_MODEL_IDS).toContain('haru');
  });

  it('getAvatarModel：未知/空 id 回落 haru', () => {
    expect(getAvatarModel(undefined).id).toBe('haru');
    expect(getAvatarModel('nope').id).toBe('haru');
    expect(getAvatarModel('hiyori').id).toBe('hiyori');
  });

  it.each(AVATAR_MODEL_LIST)(
    '$id：8 个规范表情标签都有非空映射',
    (spec) => {
      for (const tag of EXPRESSION_TAGS) {
        const name = spec.expressions[tag];
        expect(name, `${spec.id}.${tag} 应有表情映射`).toBeTruthy();
        expect(typeof name).toBe('string');
      }
    },
  );

  it.each(AVATAR_MODEL_LIST)('$id：url/动作组/贴图/表情名在模型文件中真实存在', (spec) => {
    // url 形如 /live2d/models/<id>/<file>.model3.json
    const rel = spec.url.replace(/^\/live2d\/models\//, '');
    const modelPath = path.join(MODELS_DIR, rel);
    expect(existsSync(modelPath), `model3.json 应存在：${rel}`).toBe(true);

    const json = JSON.parse(readFileSync(modelPath, 'utf8')) as Model3File;
    const dir = path.dirname(modelPath);

    // 贴图
    for (const tex of json.FileReferences.Textures ?? []) {
      expect(existsSync(path.join(dir, tex)), `贴图缺失：${tex}`).toBe(true);
    }

    // 动作组（tap 回落 idle 时两组名都可能出现）
    const groups = Object.keys(json.FileReferences.Motions ?? {});
    expect(groups).toContain(spec.idleGroup);
    expect(groups).toContain(spec.tapGroup);

    // 表情名必须是 model3.json 声明的名字之一（防止改名/拼写漂移）
    const declared = new Set((json.FileReferences.Expressions ?? []).map((e) => e.Name));
    for (const tag of EXPRESSION_TAGS) {
      const name = spec.expressions[tag]!;
      expect(declared.has(name), `${spec.id} 表情 ${tag}→${name} 不在 model3.json 声明中`).toBe(true);
    }

    // 每个表情引用的 exp3 文件存在
    for (const exp of json.FileReferences.Expressions ?? []) {
      expect(existsSync(path.join(dir, exp.File)), `表情文件缺失：${exp.File}`).toBe(true);
    }

    // LICENSE 附带
    expect(existsSync(path.join(dir, 'LICENSE.md')), `${spec.id} 应附带 LICENSE.md`).toBe(true);
  });

  it('嘴型参数与动作组规格覆盖各命名（参数面回归锚点）', () => {
    const lipParams = AVATAR_MODEL_LIST.map((m) => m.lipParam);
    // 三套命名实际存在：CamelCase / 五元音 ParamA / 大写下划线
    expect(lipParams).toEqual(
      expect.arrayContaining(['ParamMouthOpenY', 'ParamA', 'PARAM_MOUTH_OPEN_Y']),
    );
    // Mark 无专用 TapBody 时 tapGroup 回落 Idle（存在动作组即可，由文件测试保证）
    expect(AVATAR_MODELS.mark!.tapGroup).toBe('Idle');
  });
});
