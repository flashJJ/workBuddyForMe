'use client';

import * as React from 'react';
import {
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Viewport,
} from '@xyflow/react';
import type { FlowDiagnostic, WorkflowView } from '@wbfm/shared/types';
import type { FlowInputField, FlowNodeType } from '@wbfm/shared/schemas';
import { Spinner } from '@/components/common/state';
import type { FlowLiveState } from '@/lib/hooks/use-flows';
import { FlowToolbar } from './flow-toolbar';
import { NodePalette } from './node-palette';
import { FlowCanvas } from './flow-canvas';
import { ConfigPanel } from './config-panel';
import { DiagnosticsBar } from './diagnostics-bar';
import { RunInputDialog } from './run-input-dialog';
import { EndpointDialog } from './endpoint-dialog';
import { ExecutionPanel } from '../flow-execution/execution-panel';
import type { FlowStatusContextValue } from './flow-status-context';
import type { FlowCanvasEdge, FlowCanvasNode } from './graph-utils';

export function EditorLoadingState() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner label="加载工作流..." />
    </div>
  );
}

export function EditorMissingState() {
  return <div className="p-8 text-sm text-muted-foreground">工作流不存在或加载失败。</div>;
}

export interface EditorShellProps {
  workflowId: string;
  workflow: WorkflowView;
  version: number;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  running: boolean;
  diagnosticCount: number | null;
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
  selectedId: string | null;
  selectedNode: FlowCanvasNode | null;
  status: FlowStatusContextValue;
  diagnostics: FlowDiagnostic[] | null;
  centerRef: React.RefObject<HTMLDivElement>;
  runId: string | null;
  live: FlowLiveState;
  runDialogOpen: boolean;
  startFields: FlowInputField[];
  lastRunInput: Record<string, unknown>;
  servingOpen: boolean;
  published: boolean;
  onSave: () => void;
  onValidate: () => void;
  onPublish: () => void;
  onServing: () => void;
  onRun: () => void;
  onAddNode: (type: FlowNodeType, position?: { x: number; y: number }) => void;
  onNodesChange: (changes: NodeChange<FlowCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (edge: FlowCanvasEdge) => void;
  onSelectNode: (id: string | null) => void;
  onDeleteNodes: (ids: string[]) => void;
  onDeleteEdges: (ids: string[]) => void;
  onViewportChange: (vp: Viewport) => void;
  onChangeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onCloseDiagnostics: () => void;
  onSubmitRun: (input: Record<string, unknown>) => void;
  onCloseRunDialog: () => void;
  onCloseRun: () => void;
  onRerun: () => void;
  onCloseEndpoint: () => void;
}

export function EditorShell({
  workflowId,
  workflow,
  version,
  dirty,
  saving,
  publishing,
  running,
  diagnosticCount,
  nodes,
  edges,
  selectedId,
  selectedNode,
  status,
  diagnostics,
  centerRef,
  runId,
  live,
  runDialogOpen,
  startFields,
  lastRunInput,
  servingOpen,
  published,
  onSave,
  onValidate,
  onPublish,
  onServing,
  onRun,
  onAddNode,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
  onDeleteNodes,
  onDeleteEdges,
  onViewportChange,
  onChangeConfig,
  onCloseDiagnostics,
  onSubmitRun,
  onCloseRunDialog,
  onCloseRun,
  onRerun,
  onCloseEndpoint,
}: EditorShellProps) {
  return (
    <div className="flex h-screen flex-col">
      <FlowToolbar
        workflow={workflow}
        version={version}
        dirty={dirty}
        saving={saving}
        publishing={publishing}
        running={running}
        diagnosticCount={diagnosticCount}
        onSave={onSave}
        onValidate={onValidate}
        onPublish={onPublish}
        onServing={onServing}
        onRun={onRun}
      />
      <div className="flex min-h-0 flex-1">
        <NodePalette onAdd={(type) => onAddNode(type)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={centerRef} className="relative min-h-0 flex-1">
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDropNode={onAddNode}
              onSelectNode={onSelectNode}
              onDeleteNodes={onDeleteNodes}
              onDeleteEdges={onDeleteEdges}
              onViewportChange={onViewportChange}
              selectedNodeId={selectedId}
              status={status}
            />
            {diagnostics && (
              <DiagnosticsBar
                diagnostics={diagnostics}
                nodes={nodes}
                onSelectNode={onSelectNode}
                onClose={onCloseDiagnostics}
              />
            )}
          </div>
          {runId && (
            <ExecutionPanel
              runId={runId}
              nodes={nodes}
              live={live}
              onClose={onCloseRun}
              onRerun={onRerun}
            />
          )}
        </div>
        <ConfigPanel
          node={selectedNode}
          nodes={nodes}
          onChangeConfig={onChangeConfig}
          onDelete={(id) => onDeleteNodes([id])}
          onClose={() => onSelectNode(null)}
        />
      </div>
      <RunInputDialog
        open={runDialogOpen}
        fields={startFields}
        initial={lastRunInput}
        onSubmit={onSubmitRun}
        onClose={onCloseRunDialog}
      />
      <EndpointDialog
        open={servingOpen}
        workflowId={workflowId}
        published={published}
        onClose={onCloseEndpoint}
      />
    </div>
  );
}
