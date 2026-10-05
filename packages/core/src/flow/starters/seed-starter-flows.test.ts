import { createDatabase, createWorkflowRepository } from '@wbfm/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { compileFlow } from '../compiler';
import { STARTER_FLOWS } from './starters';
import { ensureStarterFlows } from './seed-starter-flows';

describe('starter flows 播种（v0.8 P0-7）', () => {
  let repo: ReturnType<typeof createWorkflowRepository>;

  beforeEach(() => {
    repo = createWorkflowRepository(createDatabase(':memory:'));
  });

  it('内置 3 个模板图均可编译通过（唯一 start、双分支齐全、可达 end）', () => {
    expect(STARTER_FLOWS).toHaveLength(3);
    for (const starter of STARTER_FLOWS) {
      const result = compileFlow(starter.graph);
      expect(result.ok, `${starter.name}: ${result.diagnostics.map((d) => d.message).join('；')}`).toBe(
        true,
      );
      expect(starter.graph.nodes.filter((n) => n.type === 'start')).toHaveLength(1);
    }
  });

  it('资料研究助手：条件双分支分别通向两个 end，空资料路径不引用被跳过节点', () => {
    const research = STARTER_FLOWS.find((s) => s.name === '资料研究助手')!;
    const edges = research.graph.edges;
    expect(edges.some((e) => e.source === 'check' && e.sourceHandle === 'true')).toBe(true);
    expect(edges.some((e) => e.source === 'check' && e.sourceHandle === 'false')).toBe(true);
    expect(research.graph.nodes.filter((n) => n.type === 'end').length).toBeGreaterThanOrEqual(2);
  });

  it('首次播种：3 个模板以 published + v1 落库；再次播种幂等不重复', () => {
    expect(ensureStarterFlows(repo)).toBe(3);
    for (const starter of STARTER_FLOWS) {
      const wf = repo.getWorkflow(starter.id);
      expect(wf?.status).toBe('published');
      expect(wf?.currentVersion).toBe(1);
    }
    expect(repo.listWorkflows()).toHaveLength(3);

    // 第二次：无新增
    expect(ensureStarterFlows(repo)).toBe(0);
    expect(repo.listWorkflows()).toHaveLength(3);
  });

  it('用户删除模板后重新播种会恢复；改名后不覆盖现有行', () => {
    ensureStarterFlows(repo);
    const weekly = STARTER_FLOWS[1]!;
    repo.deleteWorkflow(weekly.id);
    expect(repo.getWorkflow(weekly.id)).toBeNull();
    expect(ensureStarterFlows(repo)).toBe(1);
    expect(repo.getWorkflow(weekly.id)?.status).toBe('published');

    // 已存在（即使被改名/停用）不覆盖
    repo.updateWorkflow(weekly.id, { name: '我的周报' });
    repo.setStatus(weekly.id, 'disabled');
    expect(ensureStarterFlows(repo)).toBe(0);
    expect(repo.getWorkflow(weekly.id)?.name).toBe('我的周报');
    expect(repo.getWorkflow(weekly.id)?.status).toBe('disabled');
  });
});
