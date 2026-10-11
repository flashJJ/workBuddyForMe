import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  encodeSystemMessage,
  enUS,
  parseSystemMessage,
  renderEmbeddedMessages,
  zhCN,
  type MessageKey,
  type MessageNode,
  type MessageVars,
} from './index';

describe('system-message 系统消息线格式', () => {
  it('编码/解析往返：无 vars 与带 vars', () => {
    const a = encodeSystemMessage('agentTrace.run.cancelled');
    expect(parseSystemMessage(a)).toEqual({ key: 'agentTrace.run.cancelled', vars: undefined });

    const b = encodeSystemMessage('agentTrace.step.decideFailed', { message: '403' });
    expect(parseSystemMessage(b)).toEqual({
      key: 'agentTrace.step.decideFailed',
      vars: { message: '403' },
    });
  });

  it('普通文本/模型产出/旧数据解析为 null 且渲染原样透传', () => {
    expect(parseSystemMessage('简历缺失')).toBeNull();
    expect(parseSystemMessage('')).toBeNull();
    const render = (k: string) => `《${k}》`;
    expect(renderEmbeddedMessages('模型写的总结，含}花括号{也没事', render)).toBe(
      '模型写的总结，含}花括号{也没事',
    );
  });

  it('标记夹带在普通文本中间可被替换（如 前缀标记 + 用户目标）', () => {
    const tag = encodeSystemMessage('agentTrace.fallback.degradedTitle', { goal: '规划' });
    const out = renderEmbeddedMessages(`${tag} 帮我规划`, (k, v) =>
      k === 'agentTrace.fallback.degradedTitle' ? `[降级派单] ${v?.goal}` : k,
    );
    expect(out).toBe('[降级派单] 规划 帮我规划');
  });

  it('vars 值内嵌标记递归展开（终态注记嵌套末次原因）', () => {
    const cause = encodeSystemMessage('agentTrace.step.decideFailed', { message: '超时' });
    const outer = encodeSystemMessage('agentTrace.terminal.maxFailuresCause', { cause });
    const dict: Record<string, string> = {
      'agentTrace.step.decideFailed': '决策失败：{message}',
      'agentTrace.terminal.maxFailuresCause': '连续失败达上限，末次原因：{cause}',
    };
    const out = renderEmbeddedMessages(outer, (k, v) => {
      const tpl = dict[k] ?? k;
      return tpl.replace(/\{(\w+)\}/g, (_m, name) => String(v?.[name] ?? ''));
    });
    expect(out).toBe('连续失败达上限，末次原因：决策失败：超时');
  });

  it('坏标记（体内容不是 JSON）原样透传不抛错', () => {
    const SOH = String.fromCharCode(0x01);
    const STX = String.fromCharCode(0x02);
    const bad = `${SOH}not-json${STX}`;
    expect(renderEmbeddedMessages(bad, () => 'X')).toBe(bad);
    expect(parseSystemMessage(bad)).toBeNull();
  });
});

describe('system-message × agentTrace 字典端到端', () => {
  const renderZh = (raw: string) =>
    renderEmbeddedMessages(raw, (k, v) =>
      createTranslator(zhCN as MessageNode)(k as MessageKey, v as MessageVars),
    );
  const renderEn = (raw: string) =>
    renderEmbeddedMessages(raw, (k, v) =>
      createTranslator(enUS as MessageNode, { fallbackDict: zhCN as MessageNode })(
        k as MessageKey,
        v as MessageVars,
      ),
    );

  it('终态注记按语言渲染，嵌套末次原因递归展开', () => {
    const raw = encodeSystemMessage('agentTrace.terminal.maxFailuresCause', {
      cause: encodeSystemMessage('agentTrace.step.decideFailed', { message: '403 overdue' }),
    });
    expect(renderZh(raw)).toBe('执行以失败终态结束（连续失败达上限，末次原因：决策失败：403 overdue）');
    expect(renderEn(raw)).toBe(
      'Execution ended in failure (consecutive failure limit reached; last cause: Decision failed: 403 overdue)',
    );
  });

  it('预算触顶嵌套 kind 与夹带用户目标的降级标题均正确渲染', () => {
    const note = encodeSystemMessage('agentTrace.budget.note', {
      kind: encodeSystemMessage('agentTrace.budget.kind.steps'),
    });
    expect(renderZh(note)).toContain('步数达上限');
    expect(renderEn(note)).toContain('steps limit');

    const title = encodeSystemMessage('agentTrace.fallback.degradedTitle', { goal: '规划职业发展' });
    expect(renderZh(`[${title}]`)).toBe('[[降级派单] 规划职业发展]');
    expect(renderEn(`[${title}]`)).toBe('[[Degraded dispatch] 规划职业发展]');
  });

  it('模型自由文本（无标记）在两种语言下原样透传', () => {
    const free = '执行者未交付职业规划，且其判断与证据矛盾';
    expect(renderZh(free)).toBe(free);
    expect(renderEn(free)).toBe(free);
  });
});
