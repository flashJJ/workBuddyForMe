/**
 * event namespace en-US (M3): full parity with zh-CN event.ts.
 * Lines are kept short for TTS; no interpolation.
 */
import type { DeepPartialMessages } from '../types';
import type { ZhDictionary } from '../zh-CN';

export const enEvent: DeepPartialMessages<ZhDictionary>['event'] = {
  greeting: {
    morning: {
      title: 'Morning greeting',
      morning0: "Morning! Let's have a good day together.",
      morning1: 'Awake? I have been waiting for you.',
    },
    night: {
      title: 'Goodnight',
      night0: "It's getting late. Rest early, okay?",
      night1: 'Good night. See you tomorrow.',
    },
    welcome: {
      title: 'Welcome home',
      welcome0: 'Welcome back.',
      welcome1: 'A whole day apart — I missed you.',
      welcome2: 'Finally back! Long time no see!',
    },
  },
  relation: {
    praised: {
      title: 'Receiving praise',
      praised0: 'Hehe, being praised feels great.',
      praised1: "S-stop praising me. It's not like I'll... thanks.",
    },
    comfort: {
      title: 'Forgiving after a sulk',
      comfort0: "It's fine, I'm not angry anymore.",
      comfort1: "I'm okay as long as you're here.",
    },
    // v2.0 relationship level unlock scenes (fired only on level-up)
    levelup: {
      acquainted: { title: 'First acquaintance' },
      acquainted0: 'Mm, I will remember you. Nice to meet you.',
      partner: { title: 'Becoming partners' },
      partner0: 'Looks like we are partners now.',
      partner1: "Whatever comes next, let's handle it together.",
      confidant: { title: 'Becoming confidants' },
      confidant0: 'Before I knew it, you became the person I trust most.',
      confidant1: 'No matter what happens, I am on your side.',
    },
    // v2.0 M2 shared-milestone keepsake scenes (fired once on achievement)
    milestone: {
      day1: { title: 'First day together' },
      day1line0: 'Today is the first day we met. I look forward to all the days ahead.',
      day30: { title: '30 days together' },
      day30line0: 'Before I knew it, we have already spent 30 days together.',
      day30line1: 'Thank you for being around these days.',
      day100: { title: '100 days together' },
      day100line0: 'Day 100. Every day with you feels steady and real.',
      day365: { title: 'One year together' },
      day365line0: 'A whole year. Thank you — and I want every year ahead to have you in it.',
      collab10: { title: 'Ten collaborations' },
      collab10line0: 'We have finished ten things together. We make a great team.',
      collab50: { title: 'Fifty collaborations' },
      collab50line0: 'Fifty collaborations! Nothing is too much for the two of us.',
    },
  },
  touch: {
    shy: {
      title: 'Shy after repeated pats',
      shy0: "H-hey, stop patting my head...",
      shy1: 'Keep it up and I will charge a patting fee.',
    },
  },
  task: {
    success: {
      title: 'Task success celebration',
      success0: 'Done! We make a great team.',
    },
    failure: {
      title: 'Task failure encouragement',
      failure0: "It's okay. One more try will do.",
      failure1: "Just a setback. I'll try it with you.",
    },
  },
  ui: {
    preview: 'Preview scenes',
    previewHint: 'Manual previews bypass cooldown and quiet hours; unavailable during a conversation.',
    skip: 'Skip scene',
    busy: 'A conversation or scene is in progress. Try again later.',
    empty: 'No built-in scenes.',
  },
};
