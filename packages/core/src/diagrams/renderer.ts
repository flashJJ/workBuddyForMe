import { ApiError } from '@wbfm/shared/errors';
import type { DiagramInput, RenderedDiagram } from './types';
import { VIEW_BOX, wrapHtml, wrapSvg } from './svg';
import { renderArchitecture, renderFlow, renderState } from './templates/structural';
import { renderEr, renderSequence, renderTimeline } from './templates/structural-data';
import { renderQuadrant, renderSwimlane } from './templates/layouts';
import { renderBar, renderLine } from './templates/charts';

function assertRefs(ids: string[], refs: Array<{ from: string; to: string }>): void {
  const known = new Set(ids);
  for (const ref of refs) {
    if (!known.has(ref.from)) throw ApiError.validation(`图表引用了不存在的节点：${ref.from}`);
    if (!known.has(ref.to)) throw ApiError.validation(`图表引用了不存在的节点：${ref.to}`);
  }
}

function renderInner(input: DiagramInput, view: { width: number; height: number }): string {
  switch (input.type) {
    case 'architecture': {
      const ids = input.nodes.map((node) => node.id);
      assertRefs(ids, input.edges);
      return renderArchitecture(input, view);
    }
    case 'flow': {
      const ids = input.nodes.map((node) => node.id);
      assertRefs(ids, input.edges);
      return renderFlow(input, view);
    }
    case 'sequence': {
      const ids = input.actors.map((actor) => actor.id);
      assertRefs(ids, input.messages);
      return renderSequence(input, view);
    }
    case 'state': {
      const ids = input.states.map((state) => state.id);
      assertRefs(ids, input.transitions);
      return renderState(input, view);
    }
    case 'er': {
      const ids = input.entities.map((entity) => entity.id);
      assertRefs(ids, input.relations);
      return renderEr(input, view);
    }
    case 'timeline':
      return renderTimeline(input, view);
    case 'quadrant':
      return renderQuadrant(input, view);
    case 'swimlane': {
      const ids = input.steps.map((step) => step.id);
      assertRefs(ids, input.edges);
      const lanes = new Set(input.lanes.map((lane) => lane.id));
      for (const step of input.steps) {
        if (!lanes.has(step.lane)) {
          throw ApiError.validation(`步骤引用了不存在的泳道：${step.lane}`);
        }
      }
      return renderSwimlane(input, view);
    }
    case 'bar':
      return renderBar(input, view);
    case 'line': {
      for (const series of input.series) {
        if (series.values.length !== input.labels.length) {
          throw ApiError.validation(
            `折线图序列「${series.name}」的数值个数与标签数不一致`,
          );
        }
      }
      return renderLine(input, view);
    }
  }
}

/** v2.18 M2：结构化数据 → 自包含 HTML/SVG；模板负责布局，模型不手写 SVG */
export function renderDiagram(input: DiagramInput): RenderedDiagram {
  const view = VIEW_BOX[input.size ?? 'doc-inline'];
  const svg = wrapSvg(input.title, view, renderInner(input, view));
  return {
    type: input.type,
    title: input.title,
    svg,
    html: wrapHtml(input.title, svg),
  };
}
