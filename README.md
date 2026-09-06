# SoloMD PE — Personal Edition

> Portable, local-first Markdown editor. No install, no account, no cloud.

[![Latest release](https://img.shields.io/github/v/release/jukejeew/solomd)](https://github.com/jukejeew/solomd/releases/latest)
[![License: MIT](https://img.shields.io/github/license/jukejeew/solomd?color=orange)](LICENSE)

## 🇹🇭 สรุปภาษาไทย

SoloMD PE คือ Markdown editor ตัวเบาแบบ portable สำหรับใช้เองบนเครื่องนี้โดยเฉพาะ — โหลดมาแตกไฟล์แล้วรันได้เลย ไม่ต้องติดตั้ง ไม่มีบัญชี ไม่ส่งข้อมูลออกนอกเครื่อง ถ้าเคยลง upstream `solomd` ตัวเดิมไว้ ให้ลบออกก่อนกันโปรแกรมตีกัน แล้วก๊อป settings เก่ามาใช้ต่อได้ (ดูหัวข้อ Migrate)

## What is this?

Personal fork of SoloMD, repackaged as a **portable-only** build that **replaces upstream SoloMD on this machine**.

- Base: upstream `v4.11.21` + PE patches (Obsidian-faithful wikilinks, menu-bar toggle, multi-platform exit).
- Identity: `SoloMD PE`, binary `SoloMD-PE`, app id `app.solomd.pe` — installs side-by-side cleanly, owns `.md` associations once upstream is removed.
- Stack: Tauri 2 + Vue 3 + CodeMirror 6. Notes are plain `.md` files in a folder you choose; per-save local git history (AutoGit); AI rewrite is BYOK (keys stay in the OS keychain).

## Install

Grab the latest from [**Releases**](https://github.com/jukejeew/solomd/releases/latest) (`v4.11.21-pe.x`).

**Linux — x64 + arm64**

- `.AppImage`: `chmod +x` and run, or
- `.deb` (Debian/Ubuntu) / `.rpm` (Fedora/RHEL). The `.deb` declares `Conflicts/Replaces: solomd`, so installing it removes upstream automatically.

**Windows — x64 portable**

1. Download `*_x64-portable.zip`, unzip anywhere.
2. Run `SoloMD-PE.exe` — no installer. Needs WebView2 (preinstalled on most Win10 1809+ machines, otherwise https://go.microsoft.com/fwlink/p/?LinkId=2124703).

**If upstream `solomd` is still installed**, remove it first (`apt remove solomd` / delete the old portable) so the two builds don't fight over `.md` file associations.

**Migrate settings (one time):** copy the config dir and rename it —

- Windows: `%APPDATA%\app.solomd` → `%APPDATA%\app.solomd-pe`
- Linux: `~/.config/app.solomd` → `~/.config/app.solomd-pe`

## Build from source

Prereqs: Rust (stable), Node 18+, pnpm.

```bash
git clone https://github.com/jukejeew/solomd.git
cd solomd/app
pnpm install
pnpm tauri dev      # dev with hot reload
pnpm tauri build    # release artifacts → src-tauri/target/release/bundle/
```

## Notes

- **Portable-only by design.** No MSI installer, no macOS CI build. (To restore MSI, uncomment the `args: "--bundles msi"` line in `.github/workflows/release.yml`.)
- **macOS:** build locally with `./scripts/build-mac.sh` (sign + notarize), then upload the `.dmg` to the release manually.
- Upstream sync copy lives on branch `mirror` (read-only). Product work happens on `main`.

## Credits

Based on [SoloMD by zhitongblog](https://github.com/zhitongblog/solomd) (MIT) — see [LICENSE](LICENSE).
