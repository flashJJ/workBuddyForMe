import { describe, expect, it } from 'vitest';
import type { CapabilityManifest, CapabilityView } from '@wbfm/shared/schemas';
import { assertCoreVersion, dependencyIssues, dependencyOrder, findDependencyCycle } from './index';

function node(id: string, dependencies: string[]) {
  return { id, dependencies: dependencies.map((dep) => ({ id: dep })) };
}

describe('能力依赖图（v4.0 M1）', () => {
  it('依赖优先顺序稳定：被依赖者在前，同层按 id 排序', () => {
    const nodes = [node('a', ['b']), node('b', ['c']), node('c', [])];
    expect(dependencyOrder(nodes)).toEqual(['c', 'b', 'a']);

    const siblings = [node('c', ['a']), node('b', ['a']), node('a', [])];
    expect(dependencyOrder(siblings)).toEqual(['a', 'b', 'c']);
  });

  it('缺依赖不参与排序；环与自环都能检出', () => {
    expect(dependencyOrder([node('a', ['missing']), node('b', [])])).toEqual(['a', 'b']);

    const cycle = findDependencyCycle([
      node('a', ['b']),
      node('b', ['c']),
      node('c', ['a']),
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle!.at(-1));
    expect(findDependencyCycle([node('self', ['self'])])).toEqual(['self', 'self']);
  });

  it('coreVersion 是应用最低版本；缺省不校验，非法格式拒绝', () => {
    const manifest = (coreVersion?: string) => ({ coreVersion } as CapabilityManifest);
    expect(() => assertCoreVersion(manifest(), '3.1.0')).not.toThrow();
    expect(() => assertCoreVersion(manifest('3.0.0'), '3.1.0')).not.toThrow();
    expect(() => assertCoreVersion(manifest('99.0.0'), '3.1.0')).toThrow(/应用版本/);
    expect(() => assertCoreVersion(manifest('v4'), '3.1.0')).toThrow(/格式非法/);
  });

  it('健康问题覆盖环、缺失、禁用与版本不匹配', () => {
    const manifest = {
      id: 'a',
      dependencies: [{ id: 'b' }, { id: 'c', version: '2.0.0' }, { id: 'd' }],
    } as CapabilityManifest;
    const installed = [
      { id: 'b', status: 'disabled', version: '1.0.0' },
      { id: 'c', status: 'enabled', version: '1.0.0' },
    ] as CapabilityView[];
    const codes = dependencyIssues(manifest, installed, ['a', 'b', 'a']).map(
      (item) => item.code,
    );
    expect(codes).toContain('dependency_cycle');
    expect(codes).toContain('dependency_disabled');
    expect(codes).toContain('dependency_missing');
    expect(codes).toContain('dependency_version_mismatch');
  });
});
