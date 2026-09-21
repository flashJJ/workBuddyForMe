'use client';

import * as React from 'react';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { ALLOWED_DOC_EXTENSIONS } from '@wbfm/shared';
import { useKnowledgeMutations } from '@/lib/hooks/use-knowledge';

interface Props {
  kbId: string;
}

function isAllowed(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 拖拽/点选上传文档；多文件排队提交，后台异步摄入 */
export function UploadDropzone({ kbId }: Props) {
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    const valid = files.filter(isAllowed);
    if (valid.length < files.length) {
      toast.error('仅支持 .txt / .md / .markdown / .pdf 文件');
    }
    for (const file of valid) {
      try {
        await mutations.uploadDocument.mutateAsync({ kbId, file });
        toast.success(`已上传 ${file.name}，正在后台索引`);
      } catch (error) {
        toast.error(error instanceof ApiClientError ? error.message : `${file.name} 上传失败`);
      }
    }
  };

  return (
    <div
      data-testid="upload-dropzone"
      data-dragging={dragging}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
        dragging ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <p className="text-sm font-medium">拖拽文档到这里，或点击选择文件</p>
      <p className="text-xs text-muted-foreground">
        支持 .txt / .md / .pdf / .docx / .xlsx / .pptx，多文件可同时上传
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_DOC_EXTENSIONS.join(',')}
        className="hidden"
        aria-label="选择文档上传"
        onChange={(event) => {
          void uploadFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}
