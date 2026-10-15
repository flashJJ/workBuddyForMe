import type { StageScenePayload } from '../schemas/stage';

/** stage_scenes 表行（v027） */
export interface StageSceneRecord {
  id: string;
  name: string;
  /** M1 无内置场景，字段保留（协议冻结为 0/1） */
  isBuiltin: boolean;
  payload: StageScenePayload;
  createdAt: string;
  updatedAt: string;
}
