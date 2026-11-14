import type { PetScriptStorySummary } from '@wbfm/shared/schemas';
import { MOTIF_LOOKBACK, MAX_THREAD_SCENES, type StoryState } from './threads';

/**
 * P8.4/P8.6：剧情摘要与生成上下文（从 story.ts 拆出，控制单文件行数）。
 *
 * 摘要给面板/客户端；上下文拼进 user prompt，负责续接、避重与母题轮换。
 */

export function storySummary(state: StoryState): PetScriptStorySummary {
  const recent = state.recent.slice(0, 5);
  return {
    openThreads: state.threads.filter((thread) => thread.status === 'open').length,
    recentThemes: recent.map((entry) => entry.theme),
    recentSceneIds: recent.map((entry) => entry.sceneId),
    cliffhanger: state.cliffhanger?.text ?? null,
    usedTags: state.usedTags.slice(0, 12),
    recentProps: [...new Set(recent.flatMap((entry) => entry.props))].slice(0, 8),
  };
}

/** 拼进提示词：当前悬念 + 进行中的线 + 近期主题/梗/道具 */
export function storyContextForPrompt(state: StoryState): string {
  const open = state.threads.filter((thread) => thread.status === 'open');
  if (!state.cliffhanger && open.length === 0 && state.recent.length === 0) {
    return '（暂无历史剧情，可以开一条新线）';
  }
  const lines: string[] = [];
  if (state.cliffhanger) {
    lines.push(
      `未收悬念：${state.cliffhanger.text}（续接时在 story.resolves 原样引用；也可以留新的 story.cliffhanger）`,
    );
  }
  if (open.length > 0) {
    const detail = open
      .map((thread) => {
        const name = thread.title || thread.theme;
        const count = thread.sceneIds.length;
        const limit = count >= MAX_THREAD_SCENES - 1 ? '，本场必须收线且不要再留同一悬念' : '';
        return `${name}（已连续 ${count}/${MAX_THREAD_SCENES} 场${limit}）`;
      })
      .join(' / ');
    lines.push(`进行中的线：${detail}`);
  }
  if (state.recent.length > 0) {
    lines.push(
      `最近主题（不要重复）：${state.recent
        .slice(0, 5)
        .map((entry) => entry.theme)
        .join(' / ')}`,
    );
  }
  if (state.usedTags.length > 0) {
    lines.push(`已用梗标签（避免复用）：${state.usedTags.slice(0, 10).join(' / ')}`);
  }
  const recentProps = [
    ...new Set(state.recent.slice(0, MOTIF_LOOKBACK).flatMap((entry) => entry.props)),
  ];
  if (recentProps.length > 0) {
    lines.push(`最近道具（不要重复，收线场除外）：${recentProps.join(' / ')}`);
  }
  const recentPools = [
    ...new Set(state.recent.slice(0, MOTIF_LOOKBACK).flatMap((entry) => entry.linePools)),
  ];
  if (recentPools.length > 0) {
    lines.push(`最近台词池（尽量换一组）：${recentPools.join(' / ')}`);
  }
  return lines.join('\n');
}
