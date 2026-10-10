import { DEFAULT_AVATAR_MODEL_ID } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { ExpressionTag } from './expression-parser';

/**
 * 内置 Live2D 模型注册表（M3.5 起 5 套，全部为 Live2D Cubism Web Samples
 * 官方原创角色，同属 Free Material License，随包分发合规）。
 * 资源在 public/live2d 下，随形象动态 chunk 才发起请求；不进 NSIS 安装包，
 * 由 Web 服务静态提供（桌面端 standalone 同样可服务 public 资源）。
 */
export interface AvatarModelSpec {
  id: string;
  /** 形象选择器展示名（i18n 键，渲染处 t() 解析） */
  label: MessageKey;
  /** model3.json 的可访问 URL */
  url: string;
  /** 规范表情 → 模型内表情名（model3.json FileReferences.Expressions[].Name） */
  expressions: Partial<Record<ExpressionTag, string>>;
  /** 待机动作组名（随机循环） */
  idleGroup: string;
  /** 点击动作组名；该模型无专用触摸组时回落 idleGroup */
  tapGroup: string;
  /** 口型参数（model3.json Groups LipSync；各样本命名不一致，已逐模型核实） */
  lipParam: string;
  /** 许可说明（About 面板展示） */
  license: string;
}

/**
 * 表情映射说明：
 * - Haru 8 表情 F01-F08 经真机逐表情比对（f04=笑眼 joy 等，与文件序号语义不一致）；
 * - Hiyori/Mark/Wanko 仅 6 个语义表情（Normal/Smile/Blushing/Sad/Wronged/Angry），
 *   缺的 surprise/disgust/fear/smirk 按近义回落（惊喜→Smile、嫌弃→Angry、
 *   不安→Wronged、坏笑→Blushing），真机验收时可再微调；
 * - Mao 8 表情 exp_01-08：01 中性/02 笑眼/03 害羞/04 悲/05 委屈/06 怒/07 挑眉得意/
 *   08 生气嫌弃嘴（无真"惊讶"，surprise 回落笑眼 02）。
 */
export const AVATAR_MODELS: Record<string, AvatarModelSpec> = {
  haru: {
    id: 'haru',
    label: 'avatar.models.haru',
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
  hiyori: {
    id: 'hiyori',
    label: 'avatar.models.hiyori',
    url: '/live2d/models/hiyori/Hiyori.model3.json',
    expressions: {
      neutral: 'Normal',
      joy: 'Smile',
      anger: 'Angry',
      sadness: 'Sad',
      surprise: 'Smile', // 无瞪眼表情：惊喜回落笑眼
      disgust: 'Angry', // 嫌弃不悦 → 怒脸
      fear: 'Wronged', // 不安 → 委屈
      smirk: 'Blushing', // 得意坏笑 → 脸红（最近义）
    },
    idleGroup: 'Idle',
    tapGroup: 'TapBody',
    lipParam: 'ParamMouthOpenY',
    license: 'Live2D Cubism Web Samples「Hiyori」© Live2D Limited（Sample Content License）',
  },
  mark: {
    id: 'mark',
    label: 'avatar.models.mark',
    url: '/live2d/models/mark/Mark.model3.json',
    expressions: {
      neutral: 'Normal',
      joy: 'Smile',
      anger: 'Angry',
      sadness: 'Sad',
      surprise: 'Smile',
      disgust: 'Angry',
      fear: 'Wronged',
      smirk: 'Blushing',
    },
    idleGroup: 'Idle',
    // Mark 样本无 TapBody 动作组、HitAreas 为空：点击回落播放待机动作
    tapGroup: 'Idle',
    // model3.json 的 LipSync group 为空（样本数据疏漏），但 ParamMouthOpenY 实际存在
    lipParam: 'ParamMouthOpenY',
    license: 'Live2D Cubism Web Samples「Mark」© Live2D Limited（Sample Content License）',
  },
  mao: {
    id: 'mao',
    label: 'avatar.models.mao',
    url: '/live2d/models/mao/Mao.model3.json',
    expressions: {
      neutral: 'exp_01',
      joy: 'exp_02',
      anger: 'exp_06',
      sadness: 'exp_04',
      surprise: 'exp_02', // 无真惊讶：回落笑眼
      disgust: 'exp_08', // exp_08 为生气/嫌弃嘴型
      fear: 'exp_05',
      smirk: 'exp_07', // exp_07 挑眉+下撇嘴角，最接近得意/调皮
    },
    idleGroup: 'Idle',
    tapGroup: 'TapBody',
    // Mao 用日语五元音口型，LipSync group 指向张嘴「あ」参数 ParamA
    lipParam: 'ParamA',
    license: 'Live2D Cubism Web Samples「Mao」© Live2D Limited（Sample Content License）',
  },
  wanko: {
    id: 'wanko',
    label: 'avatar.models.wanko',
    url: '/live2d/models/wanko/Wanko.model3.json',
    expressions: {
      neutral: 'Normal',
      joy: 'Smile',
      anger: 'Angry',
      sadness: 'Sad',
      surprise: 'Smile',
      disgust: 'Angry',
      fear: 'Wronged',
      smirk: 'Blushing',
    },
    idleGroup: 'Idle',
    tapGroup: 'TapBody',
    // Wanko 参数为大写下划线命名
    lipParam: 'PARAM_MOUTH_OPEN_Y',
    license: 'Live2D Cubism Web Samples「Wanko」© Live2D Limited（Sample Content License）',
  },
};

/** 注册表顺序（设置选择器展示顺序） */
export const AVATAR_MODEL_LIST: AvatarModelSpec[] = [
  AVATAR_MODELS.haru!,
  AVATAR_MODELS.hiyori!,
  AVATAR_MODELS.mark!,
  AVATAR_MODELS.mao!,
  AVATAR_MODELS.wanko!,
];

export function getAvatarModel(id: string | null | undefined): AvatarModelSpec {
  return (id && AVATAR_MODELS[id]) || AVATAR_MODELS[DEFAULT_AVATAR_MODEL_ID]!;
}
