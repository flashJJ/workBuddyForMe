/**
 * 微软 Edge 在线朗读（Read Aloud）音色。
 * 该服务免密钥，音色用 ShortName 标识；列表仅作 UI 快捷项，
 * 用户已保存的其他音色 id 也应原样保留。
 */

export const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural';

export const EDGE_TTS_VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao · 晓晓 (F)' },
  { value: 'zh-CN-XiaoyiNeural', label: 'Xiaoyi · 晓伊 (F)' },
  { value: 'zh-CN-YunxiNeural', label: 'Yunxi · 云希 (M)' },
  { value: 'zh-CN-YunyangNeural', label: 'Yunyang · 云扬 (M)' },
  { value: 'zh-TW-HsiaoChenNeural', label: 'HsiaoChen · 曉臻 (F)' },
  { value: 'zh-HK-HiuMaanNeural', label: 'HiuMaan · 曉曼 (F)' },
  { value: 'en-US-AriaNeural', label: 'Aria (F, US)' },
  { value: 'en-US-GuyNeural', label: 'Guy (M, US)' },
] as const;
