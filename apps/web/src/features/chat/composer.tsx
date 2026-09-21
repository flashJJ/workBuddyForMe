'use client';

import * as React from 'react';
import { MAX_CHAT_ATTACHMENTS } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useAttachmentUpload } from './use-attachment-upload';

interface Props {
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** 当前对话模型具备 vision 能力时才开放图片附加 */
  visionEnabled?: boolean;
  onSend: (content: string, attachmentIds: string[]) => void;
  onStop: () => void;
}

function AttachmentPreviews(props: {
  items: ReturnType<typeof useAttachmentUpload>['items'];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pb-2" data-testid="attachment-previews">
      {props.items.map((item) => (
        <div key={item.attachmentId} className="group relative h-16 w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt="待发图片"
            className="h-16 w-16 rounded-md border object-cover"
          />
          <button
            type="button"
            aria-label="移除图片"
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs text-background opacity-80 hover:opacity-100"
            onClick={() => props.onRemove(item.attachmentId)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Composer({ streaming, disabled, placeholder, visionEnabled, onSend, onStop }: Props) {
  const [value, setValue] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const toast = useToast();
  const attachments = useAttachmentUpload({ onError: toast.error });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canSend =
    !streaming &&
    !disabled &&
    !attachments.uploading &&
    (Boolean(value.trim()) || attachments.items.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(
      value.trim(),
      attachments.items.map((item) => item.attachmentId),
    );
    setValue('');
    attachments.reset();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!visionEnabled) return;
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) {
      event.preventDefault();
      void attachments.addFiles(files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!visionEnabled) return;
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) void attachments.addFiles(files);
  };

  if (streaming) {
    return (
      <div className="border-t p-3" data-testid="composer">
        <Button type="button" variant="outline" className="w-full" onClick={onStop}>
          ■ 停止生成
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`border-t p-3 ${dragging ? 'bg-accent/40 ring-2 ring-inset ring-primary/40' : ''}`}
      data-testid="composer"
      onDragOver={(event) => {
        event.preventDefault();
        if (visionEnabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {attachments.items.length > 0 && (
        <AttachmentPreviews items={attachments.items} onRemove={attachments.remove} />
      )}
      <div className="flex items-end gap-2">
        {visionEnabled && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) void attachments.addFiles(files);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-[44px] shrink-0 px-3"
              aria-label="附加图片"
              title={`附加图片（最多 ${MAX_CHAT_ATTACHMENTS} 张）`}
              disabled={disabled || attachments.uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {attachments.uploading ? '上传中…' : '图片'}
            </Button>
          </>
        )}
        <textarea
          aria-label="消息输入框"
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          rows={2}
          value={value}
          disabled={disabled}
          placeholder={
            visionEnabled
              ? placeholder ?? '输入消息或粘贴/拖入图片，Enter 发送'
              : placeholder ?? '输入消息，Enter 发送，Shift+Enter 换行'
          }
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <Button type="button" onClick={submit} disabled={!canSend} aria-label="发送消息">
          发送
        </Button>
      </div>
    </div>
  );
}
