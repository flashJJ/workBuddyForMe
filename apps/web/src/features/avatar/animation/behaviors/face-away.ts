import type { BehaviorDefinition } from '../contracts';

/**
 * 背对：只声明视线目标，转身角仍由 TurnState 驱动 scene.rotation.y。
 * 行为化之后，剧本可以用同一 id 覆盖视线与表情，而不改控制器。
 */
export const FACE_AWAY: BehaviorDefinition = {
  id: 'behavior.face-away',
  priority: 2,
  interrupt: 'all',
  loop: {
    tracks: [{ kind: 'look', target: 'away', weight: 1 }],
  },
};
