'use client';

import type { Assistant, ProviderModel } from '@wbfm/shared/types';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 上下文窗口不超过该值视为小模型（含 Ollama 默认 4096 档），给出弱模型手感提示 */
const SMALL_MODEL_WINDOW = 8192;

interface RowProps {
  rowKey: string;
  label: string;
  chatModels: ProviderModel[];
  value: string;
  nullLabel: string;
  /** 记忆提取行 v1.8 只读 */
  readOnly?: boolean;
  readOnlyValue?: string;
  testid: string;
  onChange?: (modelId: string | null) => void;
}

function MatrixRow(props: RowProps) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[10rem_1fr] items-center gap-3 py-1.5">
      <span className="text-sm">{props.label}</span>
      {props.readOnly ? (
        <span className="text-xs text-muted-foreground" data-testid={props.testid}>
          {props.readOnlyValue}
          <span className="ml-2">{t('tuning.matrix.memoryReadonlyHint')}</span>
        </span>
      ) : (
        <Select
          aria-label={props.label}
          data-testid={props.testid}
          value={props.value}
          onChange={(e) => props.onChange?.(e.target.value || null)}
        >
          <option value="">{props.nullLabel}</option>
          {props.chatModels.map((model) => (
            <option key={model.id} value={model.id}>
              {t('assistants.form.modelOption', {
                displayName: model.displayName,
                modelId: model.modelId,
              })}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

interface Props {
  assistant: Assistant;
  defaultChatModelId: string | null;
  chatModels: ProviderModel[];
  onPatch: (patch: {
    modelId?: string | null;
    plannerModelId?: string | null;
    executorModelId?: string | null;
    reviewerModelId?: string | null;
  }) => void;
}

/** v1.8 G6：场景模型矩阵——聊天/记忆/Planner/Executor/Reviewer 五行 */
export function ScenarioModelMatrix({ assistant, defaultChatModelId, chatModels, onPatch }: Props) {
  const { t } = useI18n();
  const effectiveChatId = assistant.modelId ?? defaultChatModelId;
  const effectiveChat = chatModels.find((m) => m.id === effectiveChatId);
  const isSmallModel =
    effectiveChat?.contextWindow != null && effectiveChat.contextWindow <= SMALL_MODEL_WINDOW;

  return (
    <div className="space-y-2" data-testid="tuning-model-matrix">
      <div>
        <h4 className="text-sm font-medium">{t('tuning.matrix.title')}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('tuning.matrix.description')}</p>
      </div>
      <div className="divide-y rounded-md border">
        <div className="px-3">
          <MatrixRow
            rowKey="chat"
            label={t('tuning.matrix.scenarioChat')}
            chatModels={chatModels}
            value={assistant.modelId ?? ''}
            nullLabel={t('tuning.matrix.followDefault')}
            testid="tuning-model-chat"
            onChange={(modelId) => onPatch({ modelId })}
          />
        </div>
        <div className="px-3">
          <MatrixRow
            rowKey="memory"
            label={t('tuning.matrix.scenarioMemory')}
            chatModels={chatModels}
            value=""
            nullLabel=""
            readOnly
            readOnlyValue={
              effectiveChat
                ? t('assistants.form.modelOption', {
                    displayName: effectiveChat.displayName,
                    modelId: effectiveChat.modelId,
                  })
                : t('tuning.matrix.followDefault')
            }
            testid="tuning-model-memory"
          />
        </div>
        <div className="px-3">
          <MatrixRow
            rowKey="planner"
            label={t('tuning.matrix.scenarioPlanner')}
            chatModels={chatModels}
            value={assistant.plannerModelId ?? ''}
            nullLabel={t('tuning.matrix.followAssistant')}
            testid="tuning-model-planner"
            onChange={(modelId) => onPatch({ plannerModelId: modelId })}
          />
        </div>
        <div className="px-3">
          <MatrixRow
            rowKey="executor"
            label={t('tuning.matrix.scenarioExecutor')}
            chatModels={chatModels}
            value={assistant.executorModelId ?? ''}
            nullLabel={t('tuning.matrix.followAssistant')}
            testid="tuning-model-executor"
            onChange={(modelId) => onPatch({ executorModelId: modelId })}
          />
        </div>
        <div className="px-3">
          <MatrixRow
            rowKey="reviewer"
            label={t('tuning.matrix.scenarioReviewer')}
            chatModels={chatModels}
            value={assistant.reviewerModelId ?? ''}
            nullLabel={t('tuning.matrix.followAssistant')}
            testid="tuning-model-reviewer"
            onChange={(modelId) => onPatch({ reviewerModelId: modelId })}
          />
        </div>
      </div>
      {isSmallModel && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="tuning-weak-hint">
          {t('tuning.matrix.weakModelHint')}
        </p>
      )}
    </div>
  );
}
