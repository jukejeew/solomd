# Release scripts

## TL;DR

```bash
# 1. Cut a release (bumps version, tags, pushes — triggers CI)
./scripts/release.sh 0.2.0

# 2. (Optional) Build a signed mac .dmg locally for testing
#    Credentials come from .env.local — see "Apple credentials" below.
./scripts/build-mac.sh

# 3. Upload a build to App Store Connect
./scripts/submit-mas.sh          # newest dist-mas/*.pkg
./scripts/submit-ios.sh          # gen/apple/build/arm64/SoloMD.ipa
```

> `submit-*.sh` **uploads** a build. It does not submit it for review — that
> still means creating the version in App Store Connect and pressing Submit.

## Apple credentials

Two ways to authenticate. The scripts pick the API key whenever it is
configured and fall back to the Apple ID pair otherwise; the logic lives in
`scripts/lib/asc-auth.sh` and is shared by `build-mac.sh`, `submit-mas.sh` and
`submit-ios.sh`.

**App Store Connect API key — preferred.** It belongs to the team rather than
to a person, is not tied to anyone's 2FA, and survives a password change, so
uploads and notarization run unattended.

1. App Store Connect → **Users and Access → Integrations → App Store Connect API**
2. Generate a key with the **App Manager** role; download the `.p8` — Apple
   serves it exactly once
3. Put it somewhere durable and add to `.env.local`:

```bash
ASC_KEY_ID="ABCD1234EF"                                   # the key's ID
ASC_ISSUER_ID="11111111-2222-3333-4444-555555555555"      # shown above the key list
ASC_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_ABCD1234EF.p8"
```

`ASC_KEY_PATH` is optional if the file already sits in one of the four
directories `altool` searches (`./private_keys`, `~/private_keys`,
`~/.private_keys`, `~/.appstoreconnect/private_keys`). When it lives anywhere
else the helper symlinks it into the last of those, because `altool` takes no
path argument — it only finds keys by filename. A symlink, not a copy: the key
stays in one place on disk.

**Apple ID + app-specific password — fallback.** Still works, still needs
`APPLE_TEAM_ID`:

```bash
APPLE_ID="you@example.com"
APPLE_PASSWORD="abcd-efgh-ijkl-mnop"    # app-specific, not the account password
APPLE_TEAM_ID="6NQM3XP5RF"
```

## What each script does

### `release.sh <version>`
- Bumps version in `tauri.conf.json`, `package.json`, `Cargo.toml`
- Commits the bump
- Tags `vX.Y.Z`
- Pushes both the commit and the tag to `origin/main`
- The pushed tag triggers `.github/workflows/release.yml`, which builds three platforms in parallel and creates a draft GitHub Release

### `build-mac.sh`
- Local-only macOS build with Developer ID signing + notarization
- Useful for testing the signing pipeline without going through CI
- Needs `APPLE_SIGNING_IDENTITY` plus one of the credential sets above

### `submit-mas.sh` / `submit-ios.sh`
- Validate, then upload a built `.pkg` / `.ipa` to App Store Connect
- Authenticate via the API key when configured, Apple ID otherwise

## Required GitHub Actions secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** for each:

| Secret | Value | Where to get it |
|---|---|---|
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: xiangdong li (6NQM3XP5RF)` | `security find-identity -v -p codesigning` |
| `APPLE_CERTIFICATE` | base64 of a `.p12` export | See "exporting the cert" below |
| `APPLE_CERTIFICATE_PASSWORD` | the password you set when exporting | (you choose it) |
| `APPLE_ID` | your Apple ID email | — |
| `APPLE_PASSWORD` | app-specific password | https://account.apple.com → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | `6NQM3XP5RF` | Apple Developer portal → Membership |

### Exporting the certificate as `.p12`

1. Open **Keychain Access**
2. Find **"Developer ID Application: xiangdong li (6NQM3XP5RF)"** in the **login** keychain
3. Right-click → **Export** → format `.p12` → set a strong password
4. Save as e.g. `developer-id.p12`
5. Encode it for GitHub:
   ```bash
   base64 -i developer-id.p12 | pbcopy
   ```
6. Paste into the `APPLE_CERTIFICATE` secret in GitHub
7. Put the password you chose into `APPLE_CERTIFICATE_PASSWORD`

## CI behavior

- **Tag push (`v*`)**: full release build, creates draft GitHub Release
- **Manual trigger** (`workflow_dispatch`): same as tag push but with the current branch
- **Without Apple secrets**: macOS build still runs but produces an unsigned `.dmg` (users will need to right-click → Open to bypass Gatekeeper)
- **Builds run in parallel** on macOS, Ubuntu, and Windows runners — total wall time usually 15-25 minutes for first run, 5-10 minutes after caching kicks in
