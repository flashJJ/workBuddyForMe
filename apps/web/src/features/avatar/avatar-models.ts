import { DEFAULT_AVATAR_MODEL_ID } from '@wbfm/shared';
import type { ExpressionTag } from './expression-parser';

/**
 * 内置 Live2D 模型注册表（v1.0 仅 1 套）。
 * 资源在 public/live2d 下，随形象动态 chunk 才发起请求；不进 NSIS 安装包，
 * 由 Web 服务静态提供（桌面端 standalone 同样可服务 public 资源）。
 */
export interface AvatarModelSpec {
  id: string;
  label: string;
  /** model3.json 的可访问 URL */
  url: string;
  /** 规范表情 → 模型内表情名（model3.json FileReferences.Expressions[].Name） */
  expressions: Partial<Record<ExpressionTag, string>>;
  /** 待机动作组名（随机循环） */
  idleGroup: string;
  /** 点击动作组名 */
  tapGroup: string;
  /** 口型参数（model3.json Groups LipSync） */
  lipParam: string;
  /** 许可说明（About 面板展示） */
  license: string;
}

export const AVATAR_MODELS: Record<string, AvatarModelSpec> = {
  haru: {
    id: 'haru',
    label: 'Haru（Live2D 官方样本）',
    url: '/live2d/models/haru/haru_greeter_t03.model3.json',
    // Haru F01~F08 在 model3.json 内命名为 f00~f07。
    // 映射经 2026-10 真机逐表情比对修正（不能只看参数名，pld Add 混合后语义以实测为准）：
    // f04=F05 笑眼眯眯(joy)、f05=F06 瞪眼抬眉(surprise)、f03=F04 皱眉抿嘴(disgust)、
    // f06=F07 含 ParamTere 焦虑(fear)；Haru 无真正坏笑，smirk 回落最接近的严肃脸 f07。
    expressions: {
      neutral: 'f00',
      joy: 'f04',
      anger: 'f01',
      sadness: 'f02',
      surprise: 'f05',
      disgust: 'f03',
      fear: 'f06',
      smirk: 'f07',
    },
    idleGroup: 'Idle',
    tapGroup: 'Tap',
    lipParam: 'ParamMouthOpenY',
    license: 'Live2D Cubism Web Samples「Haru」© Live2D Limited（Sample Content License）',
  },
};

export function getAvatarModel(id: string | null | undefined): AvatarModelSpec {
  return (id && AVATAR_MODELS[id]) || AVATAR_MODELS[DEFAULT_AVATAR_MODEL_ID]!;
}
