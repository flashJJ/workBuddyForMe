'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AssistantFormShape } from './assistant-form-body';

/**
 * 助手表单身份区段：图标 / 名称 / 配色。
 * 纯受控：值与 onChange 均来自父表单状态，语义与原内联区块一致。
 */
export function AssistantIdentityFields(props: {
  emoji: string;
  name: string;
  color: string;
  onUpdate: (patch: Partial<AssistantFormShape>) => void;
}) {
  const { emoji, name, color, onUpdate } = props;
  return (
    <div className="flex gap-3">
      <div className="w-20 space-y-1.5">
        <Label htmlFor="assistant-emoji">图标</Label>
        <Input
          id="assistant-emoji"
          value={emoji}
          onChange={(e) => onUpdate({ emoji: e.target.value })}
          maxLength={8}
        />
      </div>
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="assistant-name">名称</Label>
        <Input
          id="assistant-name"
          value={name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="例如：产品经理"
          required
          maxLength={60}
        />
      </div>
      <div className="w-24 space-y-1.5">
        <Label htmlFor="assistant-color">配色</Label>
        <Input
          id="assistant-color"
          type="color"
          value={color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="h-9 p-1"
        />
      </div>
    </div>
  );
}
