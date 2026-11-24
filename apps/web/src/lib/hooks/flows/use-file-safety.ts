'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FileSnapshotView,
  RollbackRequestParsed,
  RollbackResult,
  SnapshotCleanupResult,
} from '@wbfm/shared/schemas';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { apiGet, apiPost, apiPut } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

/** v5.1：文件边界、快照与回滚的前端查询 */

export interface WorkspaceRootsView {
  roots: string[];
  defaultRoot: string;
  maxRoots: number;
}

export interface SnapshotSettingsView {
  enabled: boolean;
  maxBytes: number;
  quotaBytes: number;
  retentionDays: number;
}

export interface SnapshotUsageView {
  bytes: number;
  count: number;
  quotaBytes: number;
}

export function useWorkspaceRoots() {
  return useVisibleQuery({
    queryKey: ['workspace-roots'],
    queryFn: () => apiGet<WorkspaceRootsView>(API.workspaceRoots),
  });
}

export function useUpdateWorkspaceRoots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roots: string[]) => apiPut<WorkspaceRootsView>(API.workspaceRoots, { roots }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace-roots'] });
    },
  });
}

export function useSnapshotSettings() {
  return useVisibleQuery({
    queryKey: ['snapshot-settings'],
    queryFn: () => apiGet<SnapshotSettingsView>(API.workspaceSnapshotSettings),
  });
}

export function useUpdateSnapshotSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: SnapshotSettingsView) =>
      apiPut<SnapshotSettingsView>(API.workspaceSnapshotSettings, settings),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['snapshot-settings'] });
    },
  });
}

export function useRunSnapshots(runId: string) {
  return useVisibleQuery({
    queryKey: ['run-snapshots', runId],
    queryFn: () =>
      apiGet<{ snapshots: FileSnapshotView[]; usage: SnapshotUsageView }>(
        API.flowRunSnapshots(runId),
      ),
    enabled: Boolean(runId),
  });
}

export function useRollbackRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { runId: string } & Partial<RollbackRequestParsed>) => {
      const { runId, ...body } = params;
      return apiPost<RollbackResult>(API.flowRunRollback(runId), body);
    },
    onSuccess: (_result, params) => {
      void qc.invalidateQueries({ queryKey: ['run-snapshots', params.runId] });
      void qc.invalidateQueries({ queryKey: ['snapshot-usage'] });
    },
  });
}

export function useSnapshotUsage() {
  return useVisibleQuery({
    queryKey: ['snapshot-usage'],
    queryFn: () => apiGet<SnapshotUsageView>(API.flowSnapshotsCleanup),
  });
}

export function useSnapshotCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean) =>
      apiPost<SnapshotCleanupResult>(API.flowSnapshotsCleanup, { dryRun }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['snapshot-usage'] });
      void qc.invalidateQueries({ queryKey: ['run-snapshots'] });
    },
  });
}
