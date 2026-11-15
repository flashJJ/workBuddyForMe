'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useMotionContent } from './use-motion-content';

export type MotionContentKind = 'behavior' | 'motion' | 'pose';

export interface MotionContentSelection {
  kind: MotionContentKind;
  id: string;
}

export interface MotionContentTarget {
  id: string;
  label: string;
}

export interface MotionContentMenuProps {
  onApply: (selection: MotionContentSelection) => void;
  /** 可选目标（舞台按角色播放）；不传则只选内容 */
  targets?: readonly MotionContentTarget[];
  target?: string;
  onTargetChange?: (id: string) => void;
}

const FIELD =
  'h-7 w-full rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-white [&>option]:text-black';
const LABEL = 'text-[10px] uppercase tracking-wider text-white/45';

/** v4.0：按当前内容快照选择行为/动作/姿势；舞台与桌宠共用 */
export function MotionContentMenu({
  onApply,
  targets,
  target,
  onTargetChange,
}: MotionContentMenuProps) {
  const { t } = useI18n();
  const { content, ready } = useMotionContent();
  const [kind, setKind] = React.useState<MotionContentKind>('behavior');
  const [selected, setSelected] = React.useState('');

  const items = React.useMemo(() => {
    if (kind === 'pose') return content.poses.map((pose) => pose.id);
    if (kind === 'motion') return content.motions.map((motion) => motion.id);
    return content.behaviors.map((behavior) => behavior.id);
  }, [content, kind]);

  const current = items.includes(selected) ? selected : (items[0] ?? '');
  const disabled = !ready || !current || (targets !== undefined && !target);

  return (
    <details
      className="pointer-events-auto rounded-lg border border-white/10 bg-white/[0.03] px-1.5 py-1"
      data-testid="motion-content-menu"
    >
      <summary className="cursor-pointer list-none text-[11px] text-white/70">
        {t('stage.motion.title')}
      </summary>
      <div className="mt-1 space-y-1">
        {targets && targets.length > 0 && (
          <label className="block space-y-0.5">
            <span className={LABEL}>{t('stage.motion.target')}</span>
            <select
              className={FIELD}
              data-testid="motion-content-target"
              value={target ?? ''}
              onChange={(event) => onTargetChange?.(event.target.value)}
            >
              {!target && <option value="">{t('stage.motion.target')}</option>}
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-0.5">
          <span className={LABEL}>{t('stage.motion.kind')}</span>
          <select
            className={FIELD}
            data-testid="motion-content-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as MotionContentKind)}
          >
            <option value="behavior">{t('stage.motion.behavior')}</option>
            <option value="motion">{t('stage.motion.motion')}</option>
            <option value="pose">{t('stage.motion.pose')}</option>
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={LABEL}>{t('stage.motion.item')}</span>
          <select
            className={FIELD}
            data-testid="motion-content-item"
            value={current}
            onChange={(event) => setSelected(event.target.value)}
          >
            {items.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white disabled:opacity-40"
          data-testid="motion-content-play"
          disabled={disabled}
          onClick={() => current && onApply({ kind, id: current })}
        >
          {t('stage.motion.play')}
        </button>
        {!ready && <p className="text-[10px] text-white/45">{t('stage.motion.loading')}</p>}
        {ready && items.length === 0 && (
          <p className="text-[10px] text-white/45">{t('stage.motion.empty')}</p>
        )}
      </div>
    </details>
  );
}
