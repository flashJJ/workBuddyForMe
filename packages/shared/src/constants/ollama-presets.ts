/**
 * v2.4 P0-1（T4）：本机 Ollama 推荐模型（收窄到 1–2 个，明示体积与耗时档）。
 * 体积取 Ollama 官方公布的近似值（以实际下载为准）；耗时只给档位——网速差异大，
 * 不对具体分钟数作承诺。型号与体积的选定已在 M0 §8 登记。
 */
export type OllamaEtaTier = 'fast' | 'medium';

export interface OllamaRecommendedModel {
  modelId: string;
  /** 约体积（MB，官方公布近似值） */
  sizeMb: number;
  /** 预计耗时档位（fast = 几分钟；medium = 数分钟到十几分钟，均取决于网速） */
  etaTier: OllamaEtaTier;
}

export const OLLAMA_RECOMMENDED_MODELS: readonly OllamaRecommendedModel[] = [
  { modelId: 'qwen2.5:7b', sizeMb: 4700, etaTier: 'medium' },
  { modelId: 'qwen2.5:3b', sizeMb: 1900, etaTier: 'fast' },
];
