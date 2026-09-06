
# SoloMD PE — Personal Edition

> Local-first Markdown editor. Installer (.deb/.rpm) on Linux, portable on Windows. No account, no cloud.

[![Latest release](https://img.shields.io/github/v/release/jukejeew/solomd-pe)](https://github.com/jukejeew/solomd-pe/releases/latest)
[![License: MIT](https://img.shields.io/github/license/jukejeew/solomd-pe?color=orange)](LICENSE)

## 🇹🇭 สรุปภาษาไทย

SoloMD PE คือ Markdown editor ตัวเบาแบบ local-first — Linux ติดตั้งผ่าน `.deb`/`.rpm`, Windows โหลด portable มาแตกไฟล์แล้วรันได้เลย ไม่มีบัญชี ไม่ส่งข้อมูลออกนอกเครื่อง โน้ตเป็นไฟล์ `.md` ธรรมดาในโฟลเดอร์ที่คุณเลือก พร้อม AutoGit เก็บประวัติทุกครั้งที่เซฟ และ AI rewrite แบบ BYOK (คีย์อยู่ใน OS keychain)

## What is this?

SoloMD PE is a lightweight, distraction-free editor for Markdown and plain text — built for this machine.

- Obsidian-faithful wikilinks, menu-bar toggle, and multi-platform exit behavior
- Identity: `SoloMD PE`, binary `SoloMD-PE`, app id `app.solomd.pe`, config at `~/.config/app.solomd-pe` (Linux) / `%APPDATA%\app.solomd-pe` (Windows)
- Stack: Tauri 2 + Vue 3 + CodeMirror 6. Notes are plain `.md` files; per-save local git history (AutoGit); AI rewrite is BYOK (keys stay in the OS keychain).

## Install

Grab the latest from [**Releases**](https://github.com/jukejeew/solomd-pe/releases/latest) (tags like `v<upstream>-pe.<n>`).

**Linux — amd64 + arm64**

- `.deb` (Debian/Ubuntu) / `.rpm` (Fedora/RHEL) — files named `<version>_<amd64|arm64>.<ext>`

**Windows — x64 portable**

1. Download `*_x64-portable.zip`, unzip anywhere.
2. Run `SoloMD-PE.exe` — no installer. Needs WebView2 (preinstalled on most Win10 1809+ machines, otherwise https://go.microsoft.com/fwlink/p/?LinkId=2124703).

## Build from source

Prereqs: Rust (stable), Node 18+, pnpm.

```bash
git clone https://github.com/jukejeew/solomd-pe.git
cd solomd-pe/app
pnpm install
pnpm tauri dev      # dev with hot reload
pnpm tauri build    # release artifacts → src-tauri/target/release/bundle/
```

## Notes

- **Windows is portable-only by design.** No MSI installer, no macOS CI build. (To restore MSI, uncomment the `args: "--bundles msi"` line in `.github/workflows/release.yml`.)
- **macOS:** build locally with `./scripts/build-mac.sh` (sign + notarize), then upload the `.dmg` to the release manually.
- Product work happens on `main`.

## Credits

Based on [SoloMD by zhitongblog](https://github.com/zhitongblog/solomd) (MIT) — see [LICENSE](LICENSE).

