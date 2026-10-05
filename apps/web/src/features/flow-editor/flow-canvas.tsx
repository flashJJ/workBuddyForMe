'use client';

import * as React from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FlowNodeType } from '@wbfm/shared';
import { flowNodeTypes } from './flow-nodes';
import { flowEdgeTypes } from './flow-edges';
import { FlowStatusContext } from './flow-status-context';
import {
  BRANCH_EDGE_TYPE,
  canConnect,
  genEdgeId,
  type FlowCanvasEdge,
  type FlowCanvasNode,
} from './graph-utils';
import { FLOW_DND_MIME } from './node-palette';

interface FlowCanvasProps {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
  onNodesChange: (changes: NodeChange<FlowCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (edge: FlowCanvasEdge) => void;
  onDropNode: (type: FlowNodeType, position: { x: number; y: number }) => void;
  onSelectNode: (id: string | null) => void;
  onDeleteNodes: (ids: string[]) => void;
  onDeleteEdges: (ids: string[]) => void;
  onViewportChange?: (vp: Viewport) => void;
  selectedNodeId: string | null;
  status: React.ContextType<typeof FlowStatusContext>;
}

export function FlowCanvas(props: FlowCanvasProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const isValidConnection = React.useCallback(
    (conn: Connection | Edge) => {
      const source = props.nodes.find((n) => n.id === conn.source);
      const target = props.nodes.find((n) => n.id === conn.target);
      return canConnect(source, target);
    },
    [props.nodes],
  );

  const handleConnect = React.useCallback(
    (conn: Connection) => {
      const source = props.nodes.find((n) => n.id === conn.source);
      if (!canConnect(source, props.nodes.find((n) => n.id === conn.target))) return;
      props.onConnect({
        id: genEdgeId(conn.source, conn.target),
        source: conn.source,
        target: conn.target!,
        ...(conn.sourceHandle === 'true' || conn.sourceHandle === 'false'
          ? { sourceHandle: conn.sourceHandle, type: BRANCH_EDGE_TYPE }
          : {}),
      });
    },
    [props],
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(FLOW_DND_MIME) as FlowNodeType;
      if (!type || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      props.onDropNode(type, {
        x: event.clientX - bounds.left - 100,
        y: event.clientY - bounds.top - 30,
      });
    },
    [props],
  );

  return (
    <FlowStatusContext.Provider value={props.status}>
      <div
        ref={wrapperRef}
        className="relative h-full w-full"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={(e) => {
          // 兜底：部分渲染层（Background SVG）下 onPaneClick 可能不触发
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) {
            props.onSelectNode(null);
          }
        }}
      >
        <ReactFlow
          nodes={props.nodes}
          edges={props.edges}
          nodeTypes={flowNodeTypes}
          edgeTypes={flowEdgeTypes}
          onNodesChange={props.onNodesChange}
          onEdgesChange={props.onEdgesChange}
          onConnect={handleConnect}
          isValidConnection={isValidConnection}
          onNodeClick={(_, node) => props.onSelectNode(node.id)}
          onPaneClick={() => props.onSelectNode(null)}
          onNodesDelete={(deleted) => props.onDeleteNodes(deleted.map((n) => n.id))}
          onEdgesDelete={(deleted) => props.onDeleteEdges(deleted.map((e) => e.id))}
          onBeforeDelete={async ({ nodes: delNodes }) => ({
            nodes: delNodes.filter((n) => n.type !== 'start' && n.type !== 'end'),
            edges: [],
          })}
          onMoveEnd={(_, viewport) => props.onViewportChange?.(viewport)}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-muted/20"
        >
          <Background gap={18} size={1} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => miniMapColor(n.type as FlowNodeType)}
            className="!bg-card"
          />
        </ReactFlow>
      </div>
    </FlowStatusContext.Provider>
  );
}

function miniMapColor(type: FlowNodeType): string {
  switch (type) {
    case 'start':
      return '#10b981';
    case 'end':
      return '#94a3b8';
    case 'llm':
      return '#8b5cf6';
    case 'knowledgeSearch':
      return '#0ea5e9';
    case 'tool':
      return '#f59e0b';
    case 'condition':
      return '#ec4899';
    case 'human':
      return '#f97316';
  }
}
