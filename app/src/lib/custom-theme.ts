/**
 * Custom CSS theme injection.
 *
 * Lets the user point SoloMD at any .css file on disk; we read it via Tauri
 * and inject as a <style id="solomd-custom-theme"> element. Re-applying
 * replaces the previous content. Empty path removes the style element.
 */

import { invoke } from '@tauri-apps/api/core';

const STYLE_ID = 'solomd-custom-theme';

interface FileReadResult {
  content: string;
  encoding: string;
  language: string;
  had_bom: boolean;
}

/**
 * Read `path` and inject it as the custom theme.
 *
 * Never throws: the `settings.customCssPath` watcher in App.vue calls this
 * fire-and-forget, so a deleted or unreadable file must not surface as an
 * unhandled rejection. Returns whether the CSS was actually applied — callers
 * that report back to the user (the Settings reload button) need to tell a
 * real reload from a silent failure, since the failure path *removes* the
 * theme rather than leaving stale CSS in place.
 */
export async function loadCustomTheme(path: string): Promise<boolean> {
  if (!path) {
    removeCustomTheme();
    return false;
  }
  try {
    const result = await invoke<FileReadResult>('read_file', { path });
    applyCss(result.content);
    return true;
  } catch (e) {
    console.error('Failed to load custom theme:', e);
    removeCustomTheme();
    return false;
  }
}

function applyCss(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function removeCustomTheme() {
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}
