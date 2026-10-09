import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowGraph, FlowNodeType } from '@wbfm/shared/schemas';
import { compileFlow } from './compiler';

export async function collect(gen: AsyncGenerator<FlowEventPayload>): Promise<FlowEventPayload[]> {
  const events: FlowEventPayload[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

export const n = (
  id: string,
  type: FlowNodeType,
  config: Record<string, unknown> = {},
  x = 0,
  y = 0,
) => ({ id, type, position: { x, y }, config });
export const e = (id: string, source: string, target: string, sourceHandle?: 'true' | 'false') => ({
  id,
  source,
  target,
  sourceHandle,
});
export const compiledOf = (graph: FlowGraph) => {
  const result = compileFlow(graph);
  if (!result.compiled) throw new Error(result.diagnostics.map((d) => d.message).join('；'));
  return result.compiled;
};
export const types = (events: FlowEventPayload[]) => events.map((x) => x.type);
