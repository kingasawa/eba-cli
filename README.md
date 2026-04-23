# eba-cli

[![npm version](https://img.shields.io/npm/v/eba-cli.svg)](https://www.npmjs.com/package/eba-cli)
[![npm downloads](https://img.shields.io/npm/dm/eba-cli.svg)](https://www.npmjs.com/package/eba-cli)
[![license](https://img.shields.io/npm/l/eba-cli.svg)](LICENSE)

> **Xcode Cloud CLI for Expo & React Native — trigger iOS builds, manage devices, certificates and profiles without opening a browser.**

Hit the **EAS free build limit** (15 builds/month)? `eba-cli` lets you trigger builds on **Xcode Cloud** — Apple's CI/CD service bundled free with your Apple Developer account (25 compute hours ≈ 75–100 builds/month).

---

## Why eba-cli?

| | EAS Build (Free)        | Xcode Cloud |
|---|-------------------------|---|
| iOS builds | 15 builds/month         | ~75–100 builds/month* |
| Cost | Free → paid after limit | Free with Apple Developer ($99/yr) |
| Setup required | None                    | One-time setup |
| Customization | Limited                 | Full control via ci_scripts |

*Based on ~15 min average build time within 25 compute hours/month.

**[Full Xcode Cloud setup guide →](https://github.com/kingasawa/eba-cli/blob/main/XCODE_CLOUD_GUIDE.md)**

---

## Installation

```bash
npm install -g eba-cli
```

**Requirements:** Node.js >= 18, Apple Developer account, Xcode Cloud enabled on App Store Connect.

---

## Setup

Add `ascAppId` to your existing `eas.json` under the **`submit`** (or **`build`**) profile you want to use:

```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

> Find your `ascAppId` in App Store Connect → My Apps → select your app → copy the number from the URL.
> 
> Note: `eba` supports both `submit` (standard EAS) and `build` paths. If both exist, `submit` takes priority.

---

## Commands

### `eba prebuild`

Generates the `ios/ci_scripts/` folder required by Xcode Cloud to install dependencies and configure the build environment.

```bash
# Run from the root of your React Native / Expo project
# (after ios/ folder already exists from expo prebuild or manually)
eba prebuild
```

Creates:
- `ios/ci_scripts/ci_post_clone.sh` — installs Node, npm deps, CocoaPods after repo clone
- `ios/ci_scripts/ci_pre_xcodebuild.sh` — syncs Manifest.lock, sets build number
- `ios/ci_scripts/ci_post_build.sh` — logs build metadata

After running, push `ios/` to GitHub before triggering a build:

```bash
git add ios/
git commit -m "chore: add xcode cloud ci scripts"
git push
```

---

### `eba build`

Triggers an Xcode Cloud build from your terminal.

```bash
eba build
# or specify an environment
eba build --env production
```

What it does:
1. Reads `ascAppId` from `eas.json`
2. Logs into Apple ID (session cached for 1 hour)
3. Finds the Xcode Cloud workflow for your app
4. Triggers the build
---

> Note: Workflow creation/editing is managed in App Store Connect UI. Apple private APIs are not reliable for CLI automation.

---

## Apple Developer Account Commands

These commands connect to your Apple Developer account to manage credentials and devices — no browser required.

> Apple ID session and team selection are cached for **1 hour**. You won't be prompted again within that window.

---

### `eba devices`

List registered iOS/iPadOS devices on your team, or register a new one.

```bash
# List all devices
eba devices

# Jump directly to register flow
eba devices --register
```

**Register via QR code** (recommended) — scan with iPhone/iPad on the same WiFi:
- CLI starts a local server and shows a QR code
- Tap "Download Profile" → install in Settings → UDID is sent to your Mac automatically

**Or enter UDID manually** as a fallback.

---

### `eba certs`

List iOS distribution & development certificates with type, serial number, and expiry.

```bash
# List all certificates
eba certs

# List and revoke one
eba certs --revoke
```

Each certificate shows:

| Column | Description |
|---|---|
| Name | Certificate display name |
| Type | e.g. iOS Distribution, APNs |
| Usage | What the cert is actually used for |
| Serial | Full serial number |
| Expiry | Days remaining or expired |

---

### `eba profiles`

List iOS provisioning profiles (App Store, Ad Hoc, Development, Enterprise).

```bash
# List all profiles
eba profiles

# List and delete one
eba profiles --delete
```

---

### `eba bundle-ids`

List or register bundle IDs (App IDs) on your developer account.

```bash
# List all iOS bundle IDs
eba bundle-ids

# Filter by name or identifier
eba bundle-ids --filter com.example

# Show capabilities for each bundle ID (slower)
eba bundle-ids --capabilities

# Register a new bundle ID
eba bundle-ids --register
```

---

## Full workflow

```bash
# One-time setup
eba prebuild
git add ios/ && git commit -m "chore: ci scripts" && git push

# Every time you want to build
eba build
```

> **Tip:** If your Xcode Cloud workflow has a **push trigger on `main`**, you don't need to run `eba build` at all.
> Simply merge your PR into `main` on GitHub and Xcode Cloud will start the build automatically.
> Use `eba build` when you want to re-trigger a build from the same commit — for example to retry a failed build without pushing new code.

---

## Xcode Cloud Setup Guide

New to Xcode Cloud? See the step-by-step guide:
**[XCODE_CLOUD_GUIDE.md](https://github.com/kingasawa/eba-cli/blob/main/XCODE_CLOUD_GUIDE.md)**

---

## License

MIT
