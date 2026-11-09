/**
 * settingsBackup 命名空间 v2.33 子集：导出概览与恢复核对文案。
 * 从 settings-backup.ts 拆出，避免单文件超过 300 行门禁。
 */
export const zhBackupReportMessages = {
  lastExportTitle: '最近一次导出',
  lastExportSummary: '{time} · {size} · {tracks} 轨',
  lastExportEncrypted: '已加密',
  exportTrackRow: '{label}：{entries} 条 · {size} · {ms}ms',
  verification: {
    title: '恢复核对',
    dismiss: '关闭',
    row: '{label}：声明 {declared} · 写入 {written} · 跳过 {skipped}',
    missing: '{count} 个附件在归档中缺失：{names}',
    unreferenced: '{count} 个附件恢复后无引用（产物除外）',
  },
};

export const enBackupReportMessages = {
  lastExportTitle: 'Last export',
  lastExportSummary: '{time} · {size} · {tracks} tracks',
  lastExportEncrypted: 'encrypted',
  exportTrackRow: '{label}: {entries} entries · {size} · {ms}ms',
  verification: {
    title: 'Restore verification',
    dismiss: 'Dismiss',
    row: '{label}: declared {declared} · written {written} · skipped {skipped}',
    missing: '{count} attachment(s) missing from the archive: {names}',
    unreferenced: '{count} attachment(s) have no reference after restore (artifacts excluded)',
  },
};
