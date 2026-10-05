import { describe, expect, it } from 'vitest';
import { evaluateUnattendedPolicy, policyDenyText } from './policy-gate';

describe('无人值守策略门控（v0.9 M4）', () => {
  it('read 工具任意策略下放行', () => {
    expect(evaluateUnattendedPolicy({ mode: 'deny_all' }, 'current_time', 'read')).toEqual({
      allowed: true,
      reason: 'read_allowed',
    });
  });

  it('deny_all：write/danger 一律拒绝', () => {
    expect(evaluateUnattendedPolicy({ mode: 'deny_all' }, 'write_tool', 'write')).toMatchObject({
      allowed: false,
      reason: 'policy_deny',
    });
    expect(evaluateUnattendedPolicy({ mode: 'deny_all' }, 'danger_tool', 'danger')).toMatchObject({
      allowed: false,
      reason: 'policy_deny',
    });
  });

  it('allowlist：仅白名单成员放行；非成员拒绝', () => {
    const policy = { mode: 'allowlist' as const, allowed: ['fetch_webpage'] };
    expect(evaluateUnattendedPolicy(policy, 'fetch_webpage', 'danger')).toMatchObject({
      allowed: true,
      reason: 'policy_allow',
    });
    expect(evaluateUnattendedPolicy(policy, 'other_write', 'write')).toMatchObject({
      allowed: false,
      reason: 'policy_deny',
    });
  });

  it('桌面控制工具即使进了 allowlist 也永久拒绝', () => {
    for (const name of [
      'screen_snapshot',
      'mouse_click',
      'keyboard_type',
      'window_focus',
      'app_launch',
      'uia_list',
    ]) {
      const decision = evaluateUnattendedPolicy(
        { mode: 'allowlist', allowed: [name] },
        name,
        'danger',
      );
      expect(decision).toEqual({ allowed: false, reason: 'desktop_control_banned' });
    }
  });

  it('拒绝文本含可检索审计标记', () => {
    expect(policyDenyText('desktop_control_banned', 'mouse_click')).toContain(
      '[policy_deny:desktop_control_banned]',
    );
    expect(policyDenyText('policy_deny', 'x')).toContain('[policy_deny:not_allowlisted]');
  });
});
