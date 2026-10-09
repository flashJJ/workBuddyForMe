'use client';

import * as React from 'react';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { ALLOWED_DOC_EXTENSIONS } from '@wbfm/shared/constants';
import { useKnowledgeMutations } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  kbId: string;
}

function isAllowed(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 拖拽/点选上传文档；多文件排队提交，后台异步摄入 */
export function UploadDropzone({ kbId }: Props) {
  const { t } = useI18n();
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    const valid = files.filter(isAllowed);
    if (valid.length < files.length) {
      toast.error(
        t('knowledge.upload.unsupported', {
          extensions: ALLOWED_DOC_EXTENSIONS.filter((ext) => ext !== '.markdown').join(' / '),
        }),
      );
    }
    for (const file of valid) {
      try {
        await mutations.uploadDocument.mutateAsync({ kbId, file });
        toast.success(t('knowledge.upload.uploaded', { name: file.name }));
      } catch (error) {
        toast.error(
          error instanceof ApiClientError
            ? error.message
            : t('knowledge.upload.uploadFailed', { name: file.name }),
        );
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
      <p className="text-sm font-medium">{t('knowledge.upload.dropTitle')}</p>
      <p className="text-xs text-muted-foreground">
        {t('knowledge.upload.dropHint')}
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_DOC_EXTENSIONS.join(',')}
        className="hidden"
        aria-label={t('knowledge.upload.inputAria')}
        onChange={(event) => {
          void uploadFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}
