/**
 * settingsBackup 命名空间 v2.33 子集：导出概览与恢复核对文案。
 * 从 settings-backup.ts 拆出，避免单文件超过 300 行门禁。
 */
export const zhBackupReportMessages = {
  lastExportTitle: '最近一次导出',
  lastExportSummary: '{time} · {size} · {tracks} 轨',
  lastExportEncrypted: '已加密',
  exportTrackRow: '{label}：{entries} 条 · {size} · {ms}ms',
  modeFull: '全量导出',
  modeIncremental: '增量导出',
  fullHint: '全量可作为独立基线，也是跨设备迁移的唯一权威。',
  incrementalHint: '增量只含上次导出后新增的数据，不含删除与修改；迁移请使用全量。',
  chainTail: '当前链尾：{kind} #{sequence}（{time}）',
  historyTitle: '更早的备份（{count} 段）',
  historyRow: '{time} · {kind} #{sequence} · {size}',
  chain: {
    title: '归档链（{count} 段，按序号恢复）',
    row: '第 {sequence} 段 · {kind} · {time}',
    full: '全量',
    incremental: '增量',
    hint: '将按序号逐段调用恢复接口；任一段失败可保留已完成段并从下一段重试。',
    confirm: '按链恢复（{count} 段）',
    segmentDone: '第 {current}/{total} 段恢复完成',
    segmentFailed: '第 {current}/{total} 段失败：{message}',
    incomplete: '归档链缺少全量基线或中间段，请补齐后重试',
    mismatch: '归档链跨链混选或父指针不连续，请检查文件',
  },
  verification: {
    title: '恢复核对',
    dismiss: '关闭',
    row: '{label}：声明 {declared} · 写入 {written} · 跳过 {skipped}',
    missing: '{count} 个附件在归档中缺失：{names}',
    unreferenced: '{count} 个附件恢复后无引用（产物除外）',
    chain: '本链已恢复 {count} 段',
    chainMissing: '缺失序号：{sequences}',
  },
};

export const enBackupReportMessages = {
  lastExportTitle: 'Last export',
  lastExportSummary: '{time} · {size} · {tracks} tracks',
  lastExportEncrypted: 'encrypted',
  exportTrackRow: '{label}: {entries} entries · {size} · {ms}ms',
  modeFull: 'Full export',
  modeIncremental: 'Incremental',
  fullHint: 'A full archive is a standalone baseline and the only authoritative migration source.',
  incrementalHint:
    'Incremental only carries data created after the last export; deletions and edits are not included. Use full for migration.',
  chainTail: 'Current chain tail: {kind} #{sequence} ({time})',
  historyTitle: 'Earlier backups ({count} segments)',
  historyRow: '{time} · {kind} #{sequence} · {size}',
  chain: {
    title: 'Archive chain ({count} segments, restored in order)',
    row: 'Segment {sequence} · {kind} · {time}',
    full: 'Full',
    incremental: 'Incremental',
    hint: 'Segments are restored one by one; if one fails, completed segments are kept and you can retry from the next.',
    confirm: 'Restore chain ({count} segments)',
    segmentDone: 'Segment {current}/{total} restored',
    segmentFailed: 'Segment {current}/{total} failed: {message}',
    incomplete: 'The chain is missing its full baseline or a middle segment',
    mismatch: 'Mixed chains or a broken parent link; please check the selected files',
  },
  verification: {
    title: 'Restore verification',
    dismiss: 'Dismiss',
    row: '{label}: declared {declared} · written {written} · skipped {skipped}',
    missing: '{count} attachment(s) missing from the archive: {names}',
    unreferenced: '{count} attachment(s) have no reference after restore (artifacts excluded)',
    chain: '{count} segment(s) restored in this chain',
    chainMissing: 'Missing sequences: {sequences}',
  },
};
