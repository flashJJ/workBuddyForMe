import { join } from 'node:path';
import { getDataRoot } from '@wbfm/config';
import {
  createFileSnapshotRepository,
  createSettingsRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import {
  createFileGuard,
  createRollbackService,
  createSnapshotService,
} from '@wbfm/core/workspace';

/** v5.1 文件安全装配：路径守卫、快照与回滚共用同一数据根与设置 */
export function createFileSafetyWiring(db: DatabaseInstance) {
  const dataRoot = getDataRoot();
  const settings = createSettingsRepository(db);
  const snapshots = createFileSnapshotRepository(db);
  const guard = createFileGuard({ dataRoot, settings });
  const snapshotService = createSnapshotService({ dataRoot, guard, snapshots, settings });
  const rollback = createRollbackService({
    guard,
    snapshots,
    blobDir: join(dataRoot, 'snapshots', 'blobs'),
  });
  return { dataRoot, guard, snapshots, settings, snapshotService, rollback };
}

export type FileSafetyWiring = ReturnType<typeof createFileSafetyWiring>;
