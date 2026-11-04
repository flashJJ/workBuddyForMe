/** v2.20 补丁：知识库编译工具栏词条（从 knowledge.ts 拆出，避免文件超 300 行门禁） */

export const zhKnowledgeCompile = {
  compileNew: '编译新增',
  rebuildAll: '全部重建',
  cancel: '取消编译',
  progress: '编译中 {done}/{total}',
  compilingDoc: '正在编译《{name}》',
  compileNone: '没有待编译或失败的文档',
  queuedToast: '已入队 {count} 个文档',
  cancelledToast: '已取消编译',
  rebuildTitle: '全部重新编译',
  rebuildConfirm: '将对 {count} 个文档重建编译产物（源文档不变，世代+1）。继续？',
  actionFailed: '编译操作失败',
  retryFailed: '重试失败（{count}）',
};

export const enKnowledgeCompile = {
  compileNew: 'Compile new',
  rebuildAll: 'Rebuild all',
  cancel: 'Cancel compile',
  progress: 'Compiling {done}/{total}',
  compilingDoc: 'Compiling “{name}”',
  compileNone: 'Nothing queued or failed to compile',
  queuedToast: 'Queued {count} document(s)',
  cancelledToast: 'Compile cancelled',
  rebuildTitle: 'Rebuild all',
  rebuildConfirm:
    'Rebuild compiled knowledge for {count} document(s) (sources untouched, generation +1). Continue?',
  actionFailed: 'Compile action failed',
  retryFailed: 'Retry failed ({count})',
};
