import { describe, expect, it } from 'vitest';
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts';

/**
 * 快捷键表防漂移（v1.2 M5）：
 * 浮层渲染、实际绑定（渲染层 keydown / Electron globalShortcut）必须与本表一致。
 * 改动键位时需同步三处，此快照即评审锚点。
 */
describe('KEYBOARD_SHORTCUTS 快捷键单一真源', () => {
  it('结构快照：分组与键位', () => {
    expect(KEYBOARD_SHORTCUTS).toMatchInlineSnapshot(`
      [
        {
          "items": [
            {
              "keys": "Ctrl + K",
              "labelKey": "shortcuts.items.commandPalette",
            },
            {
              "keys": "Ctrl + /",
              "labelKey": "shortcuts.items.shortcutsOverlay",
            },
            {
              "keys": "Ctrl + Alt + Esc",
              "labelKey": "shortcuts.items.emergencyStop",
            },
          ],
          "titleKey": "shortcuts.groups.global",
        },
        {
          "items": [
            {
              "keys": "Enter",
              "labelKey": "shortcuts.items.send",
            },
            {
              "keys": "Shift + Enter",
              "labelKey": "shortcuts.items.newline",
            },
            {
              "keys": "Tab",
              "labelKey": "shortcuts.items.skipToContent",
            },
            {
              "keys": "Esc",
              "labelKey": "shortcuts.items.closeDialog",
            },
          ],
          "titleKey": "shortcuts.groups.chat",
        },
        {
          "items": [
            {
              "keys": "↑ / ↓",
              "labelKey": "shortcuts.items.moveSelection",
            },
            {
              "keys": "Enter",
              "labelKey": "shortcuts.items.runCommand",
            },
            {
              "keys": "Esc",
              "labelKey": "shortcuts.items.closePalette",
            },
          ],
          "titleKey": "shortcuts.groups.commandPalette",
        },
      ]
    `);
  });

  it('每组至少一项且键位/标签非空、无重复 labelKey', () => {
    const seen = new Set<string>();
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);
    for (const group of KEYBOARD_SHORTCUTS) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.keys.trim().length).toBeGreaterThan(0);
        expect(item.labelKey).toMatch(/^shortcuts\./);
        expect(seen.has(item.labelKey)).toBe(false);
        seen.add(item.labelKey);
      }
    }
  });
});
