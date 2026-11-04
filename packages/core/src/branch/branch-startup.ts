import type { ServiceDeps } from '../services/base/deps';
import { createBranchService, type BranchService } from './branch-service';

/** v2.21 M4：容器启动入口——建服务并收敛上次残留的运行中分支 */
export function createRecoveredBranchService(deps: ServiceDeps): BranchService {
  const service = createBranchService(deps);
  service.recoverInterrupted();
  return service;
}
