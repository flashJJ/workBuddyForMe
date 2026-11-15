import type { MusicMood } from './music-tracks';

/** 给豆包等生成工具的「氛围清单」：文件名与内置曲目槽位一一对应 */
export interface MusicAtmosphere {
  id: string;
  mood: MusicMood;
  title: string;
  titleEn: string;
  filename: string;
  bpm: string;
  duration: string;
  useCase: string;
  useCaseEn: string;
  prompt: string;
  promptEn: string;
}

export const MUSIC_ATMOSPHERES: readonly MusicAtmosphere[] = [
  {
    id: 'theme-warm',
    mood: 'warm',
    title: '暖光日常',
    titleEn: 'Warm Daylight',
    filename: 'theme-warm.mp3',
    bpm: '70–85',
    duration: '60–90s',
    useCase: '主界面、早安、日常聊天、桌面陪伴',
    useCaseEn: 'Home, mornings, casual chat, desktop companionship',
    prompt:
      '生成一首 60–90 秒、可无缝循环的温暖日常背景音乐：木吉他分解和弦 + 轻钢琴 + 柔和弦乐垫，70–85 BPM；无歌词、无强烈鼓点、无突然的强弱变化；首尾能量一致，便于循环播放。导出 MP3 320kbps，文件名 theme-warm.mp3。',
    promptEn:
      'Create a 60–90s seamlessly loopable warm everyday background track: fingerpicked acoustic guitar, soft piano and a warm string pad at 70–85 BPM. No vocals, no heavy drums, no sudden dynamic jumps; keep the energy consistent from start to end for looping. Export MP3 320kbps as theme-warm.mp3.',
  },
  {
    id: 'theme-calm',
    mood: 'calm',
    title: '深夜陪伴',
    titleEn: 'Late Night Company',
    filename: 'theme-calm.mp3',
    bpm: '55–65',
    duration: '90–120s',
    useCase: '深夜、阅读、睡前、低刺激陪伴',
    useCaseEn: 'Late night, reading, bedtime, low-stimulation companionship',
    prompt:
      '生成一首 90–120 秒、可无缝循环的深夜陪伴氛围音乐：钢琴单音 + 环境 Pad + 极轻的黑胶噪声，55–65 BPM；旋律克制、留白多，不要鼓组和高频刺激音；首尾可直接接续。导出 MP3 320kbps，文件名 theme-calm.mp3。',
    promptEn:
      'Create a 90–120s seamlessly loopable late-night ambient piece: sparse piano notes, warm ambient pad and very light vinyl noise at 55–65 BPM. Restrained melody with plenty of space, no drum kit or bright transients; make the ends loop cleanly. Export MP3 320kbps as theme-calm.mp3.',
  },
  {
    id: 'theme-playful',
    mood: 'playful',
    title: '摸鱼喜剧',
    titleEn: 'Slacking Comedy',
    filename: 'theme-playful.mp3',
    bpm: '105–120',
    duration: '45–60s',
    useCase: '小剧场喜剧、摸鱼、轻量提示',
    useCaseEn: 'Theater comedy, slacking, light prompts',
    prompt:
      '生成一首 45–60 秒、可循环的俏皮喜剧背景音乐：拨弦、木琴、轻快贝斯与拍手节奏，105–120 BPM；带一点笨拙可爱的转折，但不要卡通音效和歌词；循环点不要有明显断句。导出 MP3 320kbps，文件名 theme-playful.mp3。',
    promptEn:
      'Create a 45–60s loopable playful comedy cue: pizzicato, marimba, bouncy bass and light claps at 105–120 BPM. Add a slightly clumsy, charming turn, but no cartoon SFX or vocals; keep the loop seam unobtrusive. Export MP3 320kbps as theme-playful.mp3.',
  },
  {
    id: 'theme-melancholy',
    mood: 'melancholy',
    title: '雨夜独白',
    titleEn: 'Rainy Monologue',
    filename: 'theme-melancholy.mp3',
    bpm: '50–60',
    duration: '90–120s',
    useCase: '雨夜、悲剧、回忆、低沉剧情',
    useCaseEn: 'Rainy nights, tragedy, memories, downbeat scenes',
    prompt:
      '生成一首 90–120 秒、可循环的雨夜独白配乐：钢琴 + 大提琴 + 很轻的雨声环境，50–60 BPM；情绪克制、不要过度煽情，旋律缓慢下行；结尾自然回到开头。导出 MP3 320kbps，文件名 theme-melancholy.mp3。',
    promptEn:
      'Create a 90–120s loopable rainy-night monologue cue: piano, cello and a subtle rain ambience at 50–60 BPM. Restrained emotion rather than melodrama, with a slow descending melody; let the ending return naturally to the opening. Export MP3 320kbps as theme-melancholy.mp3.',
  },
  {
    id: 'theme-tense',
    mood: 'tense',
    title: '悬疑推进',
    titleEn: 'Mystery Drive',
    filename: 'theme-tense.mp3',
    bpm: '80–95',
    duration: '60–90s',
    useCase: '悬疑、调查、紧张但未爆发',
    useCaseEn: 'Mystery, investigation, tension without a drop',
    prompt:
      '生成一首 60–90 秒、可循环的悬疑推进配乐：低音弦乐脉冲、稀疏打击、轻微不协和音程，80–95 BPM；保持悬念但不要突然爆点；留出对白频段，少用高频刺耳音色。导出 MP3 320kbps，文件名 theme-tense.mp3。',
    promptEn:
      'Create a 60–90s loopable mystery-drive cue: low string pulses, sparse percussion and mild dissonance at 80–95 BPM. Keep suspense without a sudden drop; leave room for dialogue and avoid harsh high frequencies. Export MP3 320kbps as theme-tense.mp3.',
  },
  {
    id: 'theme-focus',
    mood: 'focus',
    title: '专注工作',
    titleEn: 'Deep Focus',
    filename: 'theme-focus.mp3',
    bpm: '60–75',
    duration: '120s',
    useCase: '写代码、阅读、长任务、会议等待',
    useCaseEn: 'Coding, reading, long tasks, waiting for meetings',
    prompt:
      '生成一首 120 秒、可无缝循环的专注背景音乐：极简钢琴或马林巴 + 很轻的环境噪声，60–75 BPM；旋律不抢注意力，没有鼓点和高频亮音；音量平稳。导出 MP3 320kbps，文件名 theme-focus.mp3。',
    promptEn:
      'Create a 120s seamlessly loopable focus background track: minimal piano or marimba with very light ambience at 60–75 BPM. Keep the melody unobtrusive with no drums or bright highs and a steady level. Export MP3 320kbps as theme-focus.mp3.',
  },
];

export function musicAtmospherePrompt(item: MusicAtmosphere, locale: string): string {
  return locale.toLowerCase().startsWith('en') ? item.promptEn : item.prompt;
}

export function musicAtmosphereUseCase(item: MusicAtmosphere, locale: string): string {
  return locale.toLowerCase().startsWith('en') ? item.useCaseEn : item.useCase;
}

export function musicAtmosphereTitle(item: MusicAtmosphere, locale: string): string {
  return locale.toLowerCase().startsWith('en') ? item.titleEn : item.title;
}
