import type { FlowGraph } from '@wbfm/shared/schemas';
import type { FlowEventPayload } from './types';

export async function drain(gen: AsyncGenerator<FlowEventPayload>): Promise<FlowEventPayload[]> {
  const out: FlowEventPayload[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

export function graphStartEnd(output = 'DONE'): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      {
        id: 'end',
        type: 'end',
        position: { x: 200, y: 0 },
        config: { output },
      },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };
}

export function graphHuman(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      { id: 'review', type: 'human', position: { x: 200, y: 0 }, config: { prompt: '审核？' } },
      {
        id: 'end',
        type: 'end',
        position: { x: 400, y: 0 },
        config: { output: '{{$nodes.review.outputs.approved}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'review' },
      { id: 'e2', source: 'review', target: 'end' },
    ],
  };
}

export function graphDangerTool(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      {
        id: 't1',
        type: 'tool',
        position: { x: 200, y: 0 },
        config: { toolName: 'danger_tool', args: {} },
      },
      {
        id: 'end',
        type: 'end',
        position: { x: 400, y: 0 },
        config: { output: '{{$nodes.t1.outputs.summary}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 't1' },
      { id: 'e2', source: 't1', target: 'end' },
    ],
  };
}
