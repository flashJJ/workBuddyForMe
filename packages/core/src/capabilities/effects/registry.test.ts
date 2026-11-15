import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CapabilityKind, CapabilityManifest } from '@wbfm/shared/schemas';
import {
  disableCapabilityEffect,
  enableCapabilityEffect,
  registerCapabilityEffectHandler,
  uninstallCapabilityEffect,
  type CapabilityEffectDeps,
} from './index';

/** v3.1 M1：注册表允许内核之外的新 kind 走同一套 enable/disable/uninstall */
const CUSTOM_KIND = 'motion-pack' as CapabilityKind;
const UNKNOWN_KIND = 'scene-pack' as CapabilityKind;
const manifest = { id: 'com.test.motion', kind: CUSTOM_KIND } as unknown as CapabilityManifest;
const deps = {} as CapabilityEffectDeps;
const enable = vi.fn(() => 'effect-ref');
const disable = vi.fn();
const uninstall = vi.fn();

beforeAll(() => {
  registerCapabilityEffectHandler(CUSTOM_KIND, { enable, disable, uninstall });
});

describe('能力 effect handler 注册表（v3.1 S1）', () => {
  it('新 kind 注册后可启用、停用与卸载补偿', () => {
    expect(enableCapabilityEffect(manifest, '/packs/motion', deps)).toBe('effect-ref');
    expect(enable).toHaveBeenCalledWith(manifest, '/packs/motion', deps);

    disableCapabilityEffect(manifest, 'effect-ref', deps);
    expect(disable).toHaveBeenCalledWith('effect-ref', deps);

    uninstallCapabilityEffect(manifest, 'effect-ref', deps);
    expect(uninstall).toHaveBeenCalledWith('effect-ref', deps);
  });

  it('未注册 kind：启用报错，停用与卸载保持静默', () => {
    const unknown = { ...manifest, kind: UNKNOWN_KIND } as CapabilityManifest;
    expect(() => enableCapabilityEffect(unknown, '/packs/scene', deps)).toThrow(/scene-pack/);
    expect(() => disableCapabilityEffect(unknown, 'ref', deps)).not.toThrow();
    expect(() => uninstallCapabilityEffect(unknown, 'ref', deps)).not.toThrow();
  });

  it('内置或已注册 kind 不允许覆盖', () => {
    expect(() =>
      registerCapabilityEffectHandler(CUSTOM_KIND, { enable, disable }),
    ).toThrow(/已注册/);
    expect(() =>
      registerCapabilityEffectHandler('skill', { enable, disable }),
    ).toThrow(/已注册/);
  });

  it('无 effect 句柄时卸载为空操作', () => {
    uninstall.mockClear();
    uninstallCapabilityEffect(manifest, null, deps);
    expect(uninstall).not.toHaveBeenCalled();
  });
});
