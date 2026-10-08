/** @域 barrel 本地技能包（v1.1 M2 域子路径化） */
export { loadSkillsFromDisk } from './loader';
export {
  BUILTIN_SKILLS,
  BUILTIN_MEETING_NOTES,
  BUILTIN_WEEKLY_REPORT,
  BUILTIN_FILE_SEARCH,
  ensureBuiltinSkills,
} from './builtin-skills';
export {
  createSkillService,
  type EnabledSkill,
  type SkillService,
  type SkillServiceOptions,
} from './skill-service';
export { buildSkillPromptBlock, mergeSkillAllowedTools } from './skill-assembly';
