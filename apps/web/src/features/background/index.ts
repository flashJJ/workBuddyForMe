/** v4.4 M4：背景与壁纸渲染域入口 */
export { BackgroundLayer } from './background-layer';
export { MainBackground } from './main-background';
export { MainBackgroundModeProvider } from './main-background-mode';
export { MainWorkspaceGlass } from './main-workspace-glass';
export { PetBackground } from './pet-background';
export { PetFrameOverlay } from './pet-frame';
export { StageBackground } from './stage-background';
export { useBackground } from './hooks/use-background';
export { useBackgroundFiles } from './hooks/use-background-files';
export { useWallpaperContent } from './hooks/use-wallpaper-content';
export { resolveBackground, mergeBackgroundConfig } from './resolve';
export { BUILTIN_GALLERY_ITEMS, BUILTIN_MAIN_VIDEO_ITEMS, BUILTIN_PET_ITEMS } from './builtin';
export type { ResolvedBackground } from './resolve';
