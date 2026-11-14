import { MOTION_MOODS, type MotionMood } from '@wbfm/shared/schemas';

/** 阶段 3：弱偏好提示的宽松清洗（非法/超量直接丢弃，不影响场次校验） */
export interface StoryHints {
  moods?: MotionMood[];
  hours?: { from: number; to: number }[];
}

export function sanitizeMoods(value: unknown): MotionMood[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const moods = value
    .filter(
      (item): item is MotionMood =>
        typeof item === 'string' && (MOTION_MOODS as readonly string[]).includes(item),
    )
    .slice(0, 2);
  return moods.length > 0 ? moods : undefined;
}

export function sanitizeHours(value: unknown): { from: number; to: number }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const hours = value
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const { from, to } = item as Record<string, unknown>;
      if (
        typeof from !== 'number' ||
        typeof to !== 'number' ||
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 0 ||
        from > 23 ||
        to < 0 ||
        to > 23
      ) {
        return [];
      }
      return [{ from, to }];
    })
    .slice(0, 1);
  return hours.length > 0 ? hours : undefined;
}

/** 从剧情元信息提取可持久化的弱偏好（缺省不写字段） */
export function storyHints(meta: {
  moods?: MotionMood[];
  hours?: { from: number; to: number }[];
}): StoryHints {
  return {
    ...(meta.moods?.length ? { moods: [...meta.moods] } : {}),
    ...(meta.hours?.length ? { hours: [...meta.hours] } : {}),
  };
}
