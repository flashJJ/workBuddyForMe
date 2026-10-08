'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Viewport,
} from '@xyflow/react';
import type { FlowDiagnostic } from '@wbfm/shared/types';
import type { FlowNodeType } from '@wbfm/shared/schemas';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import {
  useFlow,
  useFlowMutations,
  useFlowRunAction,
  useFlowRunEvents,
} from '@/lib/hooks/use-flows';
import { EditorLoadingState, EditorMissingState, EditorShell } from './editor-shell';
import { buildFlowStatusValue, selectStartFields } from './flow-editor-utils';
import {
  createNode,
  emptyCanvas,
  fromDomain,
  toDomain,
  type FlowCanvasEdge,
  type FlowCanvasNode,
} from './graph-utils';

export function FlowEditor({ flowId }: { flowId: string }) {
  return (
    <ReactFlowProvider>
      <EditorInner flowId={flowId} />
    </ReactFlowProvider>
  );
}

function EditorInner({ flowId }: { flowId: string }) {
  const flowQuery = useFlow(flowId);
  const mutations = useFlowMutations();
  const runAction = useFlowRunAction(null);
  const toast = useToast();

  const [nodes, setNodes] = React.useState<FlowCanvasNode[]>([]);
  const [edges, setEdges] = React.useState<FlowCanvasEdge[]>([]);
  const [loadedVersion, setLoadedVersion] = React.useState(-1);
  const [dirty, setDirty] = React.useState(false);
  const [viewport, setViewport] = React.useState<Viewport | undefined>();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<FlowDiagnostic[] | null>(null);
  // 支持 ?run=<runId> 深链（运行记录重放后跳转自动打开执行面板）
  const searchParams = useSearchParams();
  const [runId, setRunId] = React.useState<string | null>(searchParams.get('run'));
  const [runDialogOpen, setRunDialogOpen] = React.useState(false);
  const [servingOpen, setServingOpen] = React.useState(false);
  const [lastRunInput, setLastRunInput] = React.useState<Record<string, unknown>>({});
  const live = useFlowRunEvents(runId);
  const centerRef = React.useRef<HTMLDivElement>(null);

  // 详情加载 / 保存新版本后，用服务端图重置画布
  React.useEffect(() => {
    const data = flowQuery.data;
    if (!data || data.version === loadedVersion) return;
    if (data.graph) {
      const canvas = fromDomain(data.graph);
      setNodes(canvas.nodes);
      setEdges(canvas.edges);
      setViewport(data.graph.viewport);
    } else {
      const initial = emptyCanvas();
      setNodes(initial.nodes);
      setEdges(initial.edges);
    }
    setLoadedVersion(data.version);
    setDirty(false);
    setDiagnostics(null);
  }, [flowQuery.data, loadedVersion]);

  const data = flowQuery.data;
  const version = data?.version ?? 0;
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const errToast = (e: unknown, fallback: string) =>
    toast.error(e instanceof ApiClientError ? e.message : fallback);

  // ── 画布变更 ──
  const onNodesChange = React.useCallback((changes: NodeChange<FlowCanvasNode>[]) => {
    if (changes.some((c) => c.type === 'position' || c.type === 'remove')) setDirty(true);
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);
  const onEdgesChange = React.useCallback((changes: EdgeChange<Edge>[]) => {
    if (changes.some((c) => c.type === 'remove')) setDirty(true);
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);
  const onConnect = React.useCallback((edge: FlowCanvasEdge) => {
    setDirty(true);
    setEdges((prev) => addEdge(edge, prev));
  }, []);

  const addNode = (type: FlowNodeType, position?: { x: number; y: number }) => {
    const rect = centerRef.current?.getBoundingClientRect();
    const pos = position ?? {
      x: (rect?.width ?? 800) / 2 - 100 + Math.random() * 60,
      y: (rect?.height ?? 500) / 2 - 40 + Math.random() * 60,
    };
    const node = createNode(type, pos);
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
    setDirty(true);
  };

  const changeConfig = (nodeId: string, config: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n)));
    setDirty(true);
  };
  const deleteNodes = (ids: string[]) => {
    const set = new Set(ids);
    setNodes((prev) => prev.filter((n) => !set.has(n.id)));
    setEdges((prev) => prev.filter((e) => !set.has(e.source) && !set.has(e.target)));
    if (selectedId && set.has(selectedId)) setSelectedId(null);
    setDirty(true);
  };
  const deleteEdges = (ids: string[]) => {
    const set = new Set(ids);
    setEdges((prev) => prev.filter((e) => !set.has(e.id)));
    setDirty(true);
  };

  // ── 保存 / 校验 / 发布 ──
  const buildGraph = () => toDomain(nodes, edges, viewport);
  const save = async () => {
    try {
      await mutations.saveVersion.mutateAsync({ id: flowId, graph: buildGraph() });
      toast.success('已保存为新版本');
    } catch (e) {
      errToast(e, '保存失败，请检查图结构');
    }
  };
  const validate = async () => {
    try {
      const res = await mutations.validate.mutateAsync({ id: flowId, graph: buildGraph() });
      setDiagnostics(res.diagnostics);
      if (res.ok) toast.success('校验通过');
    } catch (e) {
      errToast(e, '校验失败');
    }
  };
  const publish = async () => {
    try {
      await mutations.publish.mutateAsync(flowId);
      toast.success('已发布，现在可在对话中作为工具被调用');
    } catch (e) {
      errToast(e, '发布失败');
    }
  };

  // ── 试运行 ──
  const startFields = React.useMemo(() => selectStartFields(nodes), [nodes]);

  const submitRun = async (input: Record<string, unknown>) => {
    setRunDialogOpen(false);
    setLastRunInput(input);
    try {
      const res = await runAction.create.mutateAsync({ workflowId: flowId, input });
      setRunId(res.runId);
    } catch (e) {
      errToast(e, '启动运行失败');
    }
  };

  const statusValue = React.useMemo(
    () => buildFlowStatusValue(diagnostics, live.nodeStatus),
    [live.nodeStatus, diagnostics],
  );

  if (flowQuery.isLoading) {
    return <EditorLoadingState />;
  }
  if (!data) {
    return <EditorMissingState />;
  }

  return (
    <EditorShell
      workflowId={flowId}
      workflow={data.workflow}
      version={version}
      dirty={dirty}
      saving={mutations.saveVersion.isPending}
      publishing={mutations.publish.isPending}
      running={live.phase === 'running'}
      diagnosticCount={diagnostics?.length ?? null}
      nodes={nodes}
      edges={edges}
      selectedId={selectedId}
      selectedNode={selectedNode}
      status={statusValue}
      diagnostics={diagnostics}
      centerRef={centerRef}
      runId={runId}
      live={live}
      runDialogOpen={runDialogOpen}
      startFields={startFields}
      lastRunInput={lastRunInput}
      servingOpen={servingOpen}
      published={data.workflow.status === 'published'}
      onSave={save}
      onValidate={validate}
      onPublish={publish}
      onServing={() => setServingOpen(true)}
      onRun={() => setRunDialogOpen(true)}
      onAddNode={addNode}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectNode={setSelectedId}
      onDeleteNodes={deleteNodes}
      onDeleteEdges={deleteEdges}
      onViewportChange={setViewport}
      onChangeConfig={changeConfig}
      onCloseDiagnostics={() => setDiagnostics(null)}
      onSubmitRun={submitRun}
      onCloseRunDialog={() => setRunDialogOpen(false)}
      onCloseRun={() => setRunId(null)}
      onRerun={() => setRunDialogOpen(true)}
      onCloseEndpoint={() => setServingOpen(false)}
    />
  );
}
