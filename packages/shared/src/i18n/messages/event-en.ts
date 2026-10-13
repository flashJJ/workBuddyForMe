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
