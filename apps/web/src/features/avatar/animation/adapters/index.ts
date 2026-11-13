/**
 * M0c T1.5/T1.6：VRM 适配层入口。
 *
 * 只导出适配器、骨骼包装、姿势执行器与 root 采样器；动画数据从根入口引用。
 */

export { createVrmSkeleton, VrmAnimationRuntime } from './vrm';
export { POSE_EXECUTORS, type PoseExecutor } from './vrm-executors';
export { createVrmMorphExecutor } from './vrm-morph';
export { applyTwoBoneIk, type TwoBoneIkOptions } from './vrm-ik';
export { ROOT_MOTIONS, type RootMotionSampler } from './vrm-root';
