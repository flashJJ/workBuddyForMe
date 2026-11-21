import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 仓库不变量（TR-5.1）：
 * 数据根只能由 @wbfm/config 决定，其他包/应用禁止自行 homedir()、app.getPath
 * 或硬编码数据目录名，避免多入口路径漂移。
 * 例外：apps/desktop/src/main 为 Electron 主进程——userData 只能由 app.getPath
 * 获得（OS 约定），是除 config 外唯一允许的 OS 级路径所有者；其后的派生路径
 * （WBFM_DATA_ROOT）仍交由 config 的 resolveDataRoot 语义处理。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const SCAN_ROOTS = ['packages', 'apps'];
const SOURCE_EXT = new Set(['.ts', '.tsx']);
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  'release',
  '.turbo',
  // prepare-server 会把 standalone（含 apps/web/src 副本）归集到 resources/server，
  // 扫描它既让用例在并行构建下超时，也会把打包副本误判为源码
  'resources',
]);

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bhomedir\s*\(/g, label: 'homedir()' },
  { pattern: /app\.getPath\s*\(/g, label: 'app.getPath()' },
  { pattern: /\.workbuddy-for-me/g, label: '硬编码数据目录名' },
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (SOURCE_EXT.has(full.slice(full.lastIndexOf('.')))) acc.push(full);
  }
  return acc;
}

describe('集中式数据根不变量', () => {
  it('config 之外的源码不出现私有路径决策', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(join(REPO_ROOT, root))) {
        const normalized = file.replace(/\\/g, '/');
        if (normalized.includes('/packages/config/') || normalized.includes('.test.')) continue;
        // Electron 主进程 userData 例外（见文件头注释）
        if (normalized.includes('/apps/desktop/src/main/')) continue;
        const content = readFileSync(file, 'utf8');
        const labels = FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
          (hit) => hit.label,
        );
        if (labels.length > 0) offenders.push(`${normalized}: ${labels.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});

/**
 * B-61/B-62 回归（P1 上限多源）：
 * 用户可多选配置的上限必须来自 @wbfm/shared/constants，schema 与前端提交体
 * 不得再各写一份数字字面量——历史上三处不一致时，用户勾选会被静默截断。
 */
describe('用户可选上限单一来源', () => {
  const read = (relative: string) => readFileSync(join(REPO_ROOT, relative), 'utf8');

  it('助手与流程的 schema 引用共享常量', () => {
    const assistant = read('packages/shared/src/schemas/chat/assistant.ts');
    expect(assistant).toContain('ASSISTANT_ENABLED_TOOLS_MAX');
    expect(assistant).toContain('ASSISTANT_SKILL_NAMES_MAX');
    expect(assistant).toContain('ASSISTANT_KNOWLEDGE_BASES_MAX');
    expect(assistant).not.toMatch(/\.max\(20,\s*'技能数量超限'\)/);

    const flow = read('packages/shared/src/schemas/flow/flow.ts');
    expect(flow).toContain('FLOW_INPUTS_MAX');
    expect(flow).toContain('FLOW_AGENT_KNOWLEDGE_BASES_MAX');
  });

  it('助手提交体不写死技能与知识库上限', () => {
    const body = read('apps/web/src/features/assistants/assistant-form-body.ts');
    expect(body).toContain('ASSISTANT_SKILL_NAMES_MAX');
    expect(body).toContain('ASSISTANT_KNOWLEDGE_BASES_MAX');
    expect(body).not.toMatch(/,\s*10,\s*200\)/);
    expect(body).not.toMatch(/,\s*20,\s*64\)/);
  });

  it('能力信任与 MCP 名称上限引用共享常量', () => {
    const trust = read('apps/web/src/features/settings/tools/capability-trust-section.tsx');
    expect(trust).toContain('CAPABILITY_TRUSTED_KEYS_MAX');
    expect(trust).not.toMatch(/keys\.length\s*>=\s*20/);

    const mcpForm = read('apps/web/src/features/settings/mcp/mcp-server-form-dialog.tsx');
    expect(mcpForm).toContain('MCP_SERVER_NAME_MAX');
    expect(mcpForm).not.toMatch(/maxLength=\{40\}/);
  });
});

/**
 * v4.17：用户多选字段禁止在保存路径静默截断（B-61 回归）。
 * 超限必须是「可见提示 + 禁用」；slice 只允许出现在展示层（如摘要、预览）。
 */
describe('多选保存路径无静默截断', () => {
  const FORM_DIRS = [
    'apps/web/src/features/assistants',
    'apps/web/src/features/flows',
    'apps/web/src/features/settings',
  ];
  // 数组型多选字段的截断才是缺陷；字符串长度截断与展示摘要不在此列
  const MULTI_SELECT_TRUNCATE =
    /\b(skills|knowledgeBases|inputs|enabledTools|toolNames|trustedKeys|keys)\.slice\(0,\s*\d+\)/;
  const ALLOWLIST = new Set<string>();

  it('保存路径不直接截断用户选择', () => {
    const offenders: string[] = [];
    for (const relative of FORM_DIRS) {
      for (const file of walk(join(REPO_ROOT, relative))) {
        const normalized = file.replace(/\\/g, '/');
        if (normalized.includes('.test.') || ALLOWLIST.has(normalized)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (MULTI_SELECT_TRUNCATE.test(line)) {
              offenders.push(`${normalized}:${index + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
