import { describe, expect, it } from 'vitest';
import { PET_SCRIPT_JOURNAL_MAX_RETENTION_DAYS } from '@wbfm/shared/schemas';
import {
  journalDay,
  PET_SCRIPT_JOURNAL_KEY,
  recordGenerated,
  recordPlayed,
  resolveJournal,
  setJournalRetention,
} from './journal';
import { localDateKey } from './state';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 13, 12, 0).getTime();

function generated(sceneId: string, at: number) {
  return {
    sceneId,
    title: `标题 ${sceneId}`,
    theme: '换季提醒',
    trigger: 'context::workStreak',
    source: 'auto' as const,
    at,
  };
}

describe('剧情日记', () => {
  it('存储键固定，坏数据逐条丢弃', () => {
    expect(PET_SCRIPT_JOURNAL_KEY).toBe('pet-script.journal');
    const state = resolveJournal({
      items: [
        { sceneId: 'gen.a', generatedAt: NOW },
        { sceneId: '', generatedAt: NOW },
        { sceneId: 'gen.b' },
        { sceneId: 'gen.c', generatedAt: 'yesterday' },
        { sceneId: 'gen.d', generatedAt: NOW, playCount: 2, playedAt: NOW - 1000 },
        null,
      ],
    });
    expect(state.items.map((item) => item.sceneId)).toEqual(['gen.a', 'gen.d']);
    expect(state.items[0]?.title).toBe('gen.a');
    expect(state.items[1]).toMatchObject({ playCount: 2, playedAt: NOW - 1000 });
  });

  it('生成记录置顶并按 id 去重', () => {
    const first = recordGenerated(resolveJournal(null), generated('gen.a', NOW - 1000), NOW);
    const second = recordGenerated(first, generated('gen.b', NOW), NOW);
    const again = recordGenerated(second, generated('gen.a', NOW), NOW);
    expect(again.items.map((item) => item.sceneId)).toEqual(['gen.a', 'gen.b']);
    expect(again.items[0]?.generatedAt).toBe(NOW);
    expect(again.items[0]?.playCount).toBe(0);
  });

  it('播放只累加已记录场景，未知场景原样返回', () => {
    const state = recordGenerated(resolveJournal(null), generated('gen.a', NOW), NOW);
    const played = recordPlayed(state, 'gen.a', NOW + 5000);
    expect(played.items[0]).toMatchObject({ playCount: 1, playedAt: NOW + 5000 });
    const twice = recordPlayed(played, 'gen.a', NOW + 9000);
    expect(twice.items[0]).toMatchObject({ playCount: 2, playedAt: NOW + 9000 });
    expect(recordPlayed(twice, 'gen.missing', NOW)).toBe(twice);
  });

  it('按本地日期分天并统计生成/播放场次', () => {
    let state = resolveJournal(null);
    state = recordGenerated(state, generated('gen.today', NOW), NOW);
    state = recordGenerated(state, generated('gen.yesterday', NOW - DAY), NOW);
    state = recordPlayed(state, 'gen.today', NOW + 1000);
    const day = journalDay(state, localDateKey(new Date(NOW)));
    expect(day.items.map((item) => item.sceneId)).toEqual(['gen.today']);
    expect(day).toMatchObject({ generated: 1, played: 1 });
    const before = journalDay(state, localDateKey(new Date(NOW - DAY)));
    expect(before).toMatchObject({ generated: 1, played: 0 });
  });

  it('默认永久保留；设置天数后立即裁剪更早记录', () => {
    let state = resolveJournal(null);
    expect(state.retentionDays).toBeNull();
    state = recordGenerated(state, generated('gen.old', NOW - 15 * DAY), NOW);
    state = recordGenerated(state, generated('gen.keep', NOW), NOW);
    expect(state.items.map((item) => item.sceneId)).toEqual(['gen.keep', 'gen.old']);

    const seven = setJournalRetention(state, 7, NOW);
    expect(seven.retentionDays).toBe(7);
    expect(seven.items.map((item) => item.sceneId)).toEqual(['gen.keep']);

    // 后续记录沿用 7 天保留策略
    const later = recordGenerated(seven, generated('gen.new', NOW + 1000), NOW + 1000);
    expect(later.items.map((item) => item.sceneId)).toEqual(['gen.new', 'gen.keep']);

    expect(resolveJournal({ retentionDays: -1 }).retentionDays).toBeNull();
    expect(resolveJournal({ retentionDays: 99_999 }).retentionDays).toBe(
      PET_SCRIPT_JOURNAL_MAX_RETENTION_DAYS,
    );
  });
});
