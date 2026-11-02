import { describe, expect, it } from 'vitest';
import { diagramInputSchema, renderDiagram } from './index';

const specs = [
  {
    type: 'architecture',
    title: '请求如何穿过系统',
    nodes: [
      { id: 'web', label: 'Web' },
      { id: 'core', label: 'Core' },
      { id: 'db', label: 'Database' },
    ],
    edges: [
      { from: 'web', to: 'core', label: 'HTTP' },
      { from: 'core', to: 'db', label: 'SQL' },
    ],
  },
  {
    type: 'flow',
    title: '发布流程',
    nodes: [
      { id: 'start', label: '开始', shape: 'start' },
      { id: 'check', label: '测试通过？', shape: 'decision' },
      { id: 'done', label: '发布', shape: 'end' },
    ],
    edges: [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'done', label: '是' },
    ],
  },
  {
    type: 'sequence',
    title: '登录时序',
    actors: [
      { id: 'user', label: '用户' },
      { id: 'api', label: 'API' },
    ],
    messages: [
      { from: 'user', to: 'api', label: 'POST /login' },
      { from: 'api', to: 'user', label: 'token', kind: 'return' },
    ],
  },
  {
    type: 'state',
    title: '订单状态',
    states: [
      { id: 'draft', label: '草稿', initial: true },
      { id: 'paid', label: '已支付' },
      { id: 'done', label: '完成', final: true },
    ],
    transitions: [
      { from: 'draft', to: 'paid', label: '支付' },
      { from: 'paid', to: 'done', label: '发货' },
    ],
  },
  {
    type: 'er',
    title: '用户与订单',
    entities: [
      { id: 'user', name: 'User', fields: [{ name: 'id', type: 'uuid', key: true }] },
      { id: 'order', name: 'Order', fields: [{ name: 'user_id', type: 'uuid' }] },
    ],
    relations: [{ from: 'user', to: 'order', label: '拥有', cardinality: '1:N' }],
  },
  {
    type: 'timeline',
    title: '版本节奏',
    events: [
      { date: '2026-10', label: 'M0' },
      { date: '2026-11', label: 'M1' },
      { date: '2026-12', label: 'M2' },
    ],
  },
  {
    type: 'quadrant',
    title: '投入与收益',
    xAxis: { low: '低投入', high: '高投入' },
    yAxis: { low: '低收益', high: '高收益' },
    points: [
      { label: '缓存', x: 1, y: 8 },
      { label: '重构', x: 8, y: 6 },
    ],
  },
  {
    type: 'swimlane',
    title: '跨角色流程',
    lanes: [
      { id: 'pm', label: '产品' },
      { id: 'dev', label: '研发' },
    ],
    steps: [
      { id: 'spec', label: '写方案', lane: 'pm' },
      { id: 'build', label: '实现', lane: 'dev' },
    ],
    edges: [{ from: 'spec', to: 'build' }],
  },
  {
    type: 'bar',
    title: '季度销量',
    unit: '万',
    categories: [
      { label: 'Q1', value: 120 },
      { label: 'Q2', value: 150 },
    ],
  },
  {
    type: 'line',
    title: '留存趋势',
    labels: ['1月', '2月', '3月'],
    series: [{ name: '留存', values: [40, 45, 52] }],
  },
];

describe('结构化图表渲染（v2.18 M2）', () => {
  it.each(specs.map((spec) => [spec.type, spec] as const))(
    '%s 生成自包含 HTML/SVG，标题与标签存在',
    (type, spec) => {
      const parsed = diagramInputSchema.parse(spec);
      const rendered = renderDiagram(parsed);
      expect(rendered.type).toBe(type);
      expect(rendered.svg.startsWith('<svg')).toBe(true);
      expect(rendered.svg).toContain(rendered.title);
      expect(rendered.html).toContain('<!doctype html>');
      expect(rendered.html).toContain(rendered.svg);
      expect(rendered.html.toLowerCase()).not.toContain('<script');
    },
  );

  it('边引用不存在的节点时拒绝', () => {
    const parsed = diagramInputSchema.parse(specs[0]);
    expect(() =>
      renderDiagram({ ...parsed, edges: [{ from: 'web', to: 'missing' }] } as never),
    ).toThrowError(/不存在的节点/);
  });

  it('折线图数值数量与标签不一致时拒绝', () => {
    const parsed = diagramInputSchema.parse(specs[9]);
    expect(() =>
      renderDiagram({
        ...parsed,
        series: [{ name: '留存', values: [1, 2] }],
      } as never),
    ).toThrowError(/数值个数与标签数不一致/);
  });

  it('数据图拒绝非有限数字（schema 层）', () => {
    expect(() =>
      diagramInputSchema.parse({
        type: 'bar',
        title: '坏数据',
        categories: [{ label: 'A', value: Number.NaN }],
      }),
    ).toThrow();
  });
});
