/**
 * Lightweight runtime platform detection. Synchronous (no Tauri roundtrip).
 *
 * We read the WebView user-agent because every Tauri iOS build runs under
 * WKWebView, which puts `iPad` / `iPhone` in the UA string. Desktop WebViews
 * never match, so `isIOS()` is effectively "running inside the Tauri iOS
 * binary". `isMobile()` also catches Android (future-proofing).
 */

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports "Mac OS X" in UA; disambiguate via maxTouchPoints.
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * True when the Rust side actually exposes the libgit2-backed commands.
 *
 * #230 — `git2` is gated to `cfg(not(target_os = "android"))` in Cargo.toml
 * (vendored OpenSSL doesn't cross-compile into the Android NDK build), so the
 * whole `github_sync` / `git_history` / `recipe_runner` command surface is
 * compiled out of the Android binary. The frontend used to render those panels
 * anyway and every call came back as `Command github_has_token not found`.
 *
 * Anything that invokes one of those commands must check this first.
 *
 * `?forceNoGit` is a dev-only QA hook (same idea as `?forcePlain` /
 * `?forceWinChrome`) so the Android degradation can be driven from a desktop
 * dev build instead of needing an APK on a device.
 */
export function hasGitBackend(): boolean {
  if (typeof location !== 'undefined' && location.search.includes('forceNoGit')) {
    return false;
  }
  return !isAndroid();
}

/**
 * True when running on a macOS desktop WebView (not iOS / iPadOS).
 *
 * We only want this to gate the unified-titlebar treatment: on macOS the
 * window uses `titleBarStyle: "Overlay"` (tauri.conf) which floats the
 * traffic-light buttons over our toolbar, so the toolbar must reserve ~72px
 * of left padding for them and become a `data-tauri-drag-region`. Windows /
 * Linux keep native decorations and must NOT get that padding; iOS has no
 * window chrome at all. WKWebView on iPad reports "Macintosh" in its UA, so
 * we explicitly exclude the touch-capable iOS case via `isIOS()`.
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isIOS()) return false;
  const ua = navigator.userAgent || '';
  return /Macintosh|Mac OS X/.test(ua);
}

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return isIOS() || /Android/i.test(ua);
}

/**
 * True on a Windows desktop WebView — gates the frameless unified title bar
 * (custom window controls + in-app menubar in Toolbar.vue). The Windows build
 * ships `decorations: false` (tauri.windows.conf.json), so this must match
 * exactly the builds that are actually frameless: real Windows, desktop only.
 *
 * `?forceWinChrome` is a dev-only QA hook (same idea as `?forcePlain`) to
 * preview the Windows toolbar layout in the macOS dev build — it renders the
 * menubar + caption buttons but the window itself keeps its platform chrome.
 */
export function isWindowsDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isMobile()) return false;
  return /Windows NT/.test(navigator.userAgent || '');
}

export function forceWinChromePreview(): boolean {
  return typeof location !== 'undefined' && location.search.includes('forceWinChrome');
}

/** Windows desktop editor detection, including the forcePlain QA hook. */
export function isWindowsEditorRuntime(): boolean {
  return (
    (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) ||
    (typeof location !== 'undefined' && location.search.includes('forcePlain'))
  );
}

/**
 * Windows falls back to the native textarea for reliable CJK IME input, but
 * Vim is a CodeMirror extension and therefore requires the CodeMirror editor.
 * Keep this decision pure so the Windows/Vim hand-off can be regression tested
 * without booting a platform WebView.
 */
export function shouldUsePlainWindowsEditor(
  windowsRuntime: boolean,
  vimMode: boolean,
): boolean {
  return windowsRuntime && !vimMode;
}
