/** v2.29 P1：文档批量重解析队列 */

export const zhKnowledgeReparse = {
  title: '批量重建',
  start: '批量重建',
  pending: '{count, plural, other {# 篇文档待重建}}',
  progress: '完成 {done}/{total} · 失败 {failed} · 跳过 {skipped}',
  running: '正在重建：{name}',
  pausing: '当前文档完成后暂停…',
  cancelling: '当前文档完成后停止…',
  completed: '重建完成：成功 {done} 篇，失败 {failed} 篇，跳过 {skipped} 篇',
  cancelled: '已停止：成功 {done} 篇，失败 {failed} 篇，跳过 {skipped} 篇',
  pause: '暂停',
  resume: '继续',
  cancel: '停止',
  restart: '重新开始',
  failedTitle: '失败文档',
  busyElsewhere: '另一个知识库正在重建，完成后再试。',
  startFailed: '批量重建启动失败',
};

export const enKnowledgeReparse = {
  title: 'Batch rebuild',
  start: 'Rebuild all',
  pending:
    '{count, plural, one {# document needs rebuild} other {# documents need rebuild}}',
  progress: 'Done {done}/{total} · Failed {failed} · Skipped {skipped}',
  running: 'Rebuilding: {name}',
  pausing: 'Pausing after the current document…',
  cancelling: 'Stopping after the current document…',
  completed: 'Rebuild finished: {done} succeeded, {failed} failed, {skipped} skipped',
  cancelled: 'Stopped: {done} succeeded, {failed} failed, {skipped} skipped',
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Stop',
  restart: 'Start again',
  failedTitle: 'Failed documents',
  busyElsewhere: 'Another knowledge base is rebuilding. Try again when it finishes.',
  startFailed: 'Failed to start batch rebuild',
};
