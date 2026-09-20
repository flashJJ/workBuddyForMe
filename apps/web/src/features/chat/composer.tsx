'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  onSend: (content: string) => void;
  onStop: () => void;
}

export function Composer({ streaming, disabled, placeholder, onSend, onStop }: Props) {
  const [value, setValue] = React.useState('');

  const submit = () => {
    const content = value.trim();
    if (!content || streaming || disabled) return;
    onSend(content);
    setValue('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
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
    <div className="border-t p-3" data-testid="composer">
      <div className="flex items-end gap-2">
        <textarea
          aria-label="消息输入框"
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          rows={2}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? '输入消息，Enter 发送，Shift+Enter 换行'}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="发送消息"
        >
          发送
        </Button>
      </div>
    </div>
  );
}
