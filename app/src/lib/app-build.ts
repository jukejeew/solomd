// App Store distribution gate.
//
// Apple rejected macOS 1.0.3 under Guideline 3.1.1 because the BYOK
// AI / Agent surface "unlocks paid functionality without In-App Purchase".
// MAS and iOS App Store builds therefore strip the AI surface; the
// GitHub Developer ID build keeps it.
//
// App Store builds export `VITE_APP_STORE_BUILD=true` before invoking the
// Vite build (automation was `scripts/build-mas.sh` / `scripts/build-ios.sh`,
// archived at tag archive/pre-trim-20260907). The Rust
// side mirrors this with `SOLOMD_APP_STORE_BUILD=1` (see
// `app/src-tauri/src/app_build.rs`).

const raw = import.meta.env.VITE_APP_STORE_BUILD;
export const IS_APP_STORE_BUILD: boolean =
  raw === true || raw === 'true' || raw === '1';
