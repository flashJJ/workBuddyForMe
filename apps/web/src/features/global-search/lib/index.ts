export {
  GLOBAL_SEARCH_SCOPES,
  assembleGroups,
  isGlobalSearchScope,
  mapEventsToHits,
  type GlobalSearchEventScope,
  type RawSearchEvent,
} from './map-events';
export { mapDocumentHit, searchKnowledge } from './knowledge-search';
export {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCH_KEY,
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from './recent-searches';
