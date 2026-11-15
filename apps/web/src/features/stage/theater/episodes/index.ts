import type { TheaterEpisode } from './types';
import { LATE_TEA_EPISODE } from './late-tea';
import { MORNING_DRILL_EPISODE } from './morning-drill';
import { PROPOSAL_NIGHT_EPISODE } from './proposal-night';
import { RAINY_WAIT_EPISODE } from './rainy-wait';

export const THEATER_EPISODES: readonly TheaterEpisode[] = [
  LATE_TEA_EPISODE,
  MORNING_DRILL_EPISODE,
  PROPOSAL_NIGHT_EPISODE,
  RAINY_WAIT_EPISODE,
];

export const DEFAULT_THEATER_EPISODE_ID = LATE_TEA_EPISODE.id;
