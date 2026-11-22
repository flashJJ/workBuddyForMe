import { describe, expect, it } from 'vitest';
import type { Memory } from '@wbfm/shared/types';
import {
  buildMemoriesJson,
  buildMemoriesMarkdown,
  memoryExportFilename,
  toMemoryExportRow,
  type MemoryExportLabels,
} from './memory-export';

const labels: MemoryExportLabels = {
  title: '记忆导出',
  exportedAt: '导出时间',
  count: '条数',
  importance: '重要性',
  confidence: '置信度',
  pinned: '固定',
  scope: '作用域',
  status: '状态',
  subjectKey: '主体键',
  createdAt: '创建时间',
  lastConfirmedAt: '最近确认',
  yes: '是',
  no: '否',
};

const memory: Memory = {
  id: '1',
  kind: 'fact',
  content: '用户住在杭州',
  importance: 0.7,
  sourceConversationId: 'conv-secret',
  sourceMessageId: 'msg-secret',
  recallCount: 2,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastAccessedAt: null,
  scope: 'global',
  assistantId: null,
  source: 'manual',
  pinned: true,
  confidence: 0.9,
  subjectKey: 'residence:city',
  version: 1,
  supersededBy: null,
  validFrom: null,
  validTo: null,
  ttlAt: null,
  lastConfirmedAt: '2026-02-01T00:00:00.000Z',
};

describe('v4.21 记忆导出', () => {
  it('文件名按本地日期', () => {
    expect(memoryExportFilename('md', new Date(2026, 10, 22))).toBe('memories-20261122.md');
    expect(memoryExportFilename('json', new Date(2026, 10, 22))).toBe('memories-20261122.json');
  });

  it('白名单字段不含来源会话/消息 id', () => {
    const row = toMemoryExportRow(memory);
    expect(row).not.toHaveProperty('sourceConversationId');
    expect(row).not.toHaveProperty('sourceMessageId');
    expect(row).toHaveProperty('content', '用户住在杭州');

    const json = buildMemoriesJson([memory], new Date('2026-11-22T00:00:00.000Z'));
    expect(json).not.toContain('conv-secret');
    expect(json).not.toContain('msg-secret');
    expect(JSON.parse(json)).toMatchObject({ version: 1, memories: [{ kind: 'fact' }] });
  });

  it('Markdown 包含正文与治理字段', () => {
    const md = buildMemoriesMarkdown([memory], labels, new Date('2026-11-22T00:00:00.000Z'));
    expect(md).toContain('# 记忆导出');
    expect(md).toContain('用户住在杭州');
    expect(md).toContain('residence:city');
    expect(md).toContain('固定 是');
    expect(md).not.toContain('conv-secret');
  });
});
