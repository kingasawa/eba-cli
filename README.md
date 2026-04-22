# eba-cli

> **For Expo developers who have hit the EAS free build limit.**

If you're using **Expo EAS** and have run out of free iOS build credits (30 builds/month), `eba-cli` lets you trigger builds directly on **Xcode Cloud** — Apple's own CI/CD service, included free with an Apple Developer account (25 compute hours/month).

No more waiting to buy more EAS credits. Your app, your infrastructure.

---

## Why eba-cli?

| | EAS Build (Free) | Xcode Cloud |
|---|---|---|
| iOS builds | 30 builds/month | ~75–100 builds/month* |
| Cost | Free → paid after limit | Free with Apple Developer ($99/yr) |
| Setup required | None | One-time setup |
| Customization | Limited | Full control via ci_scripts |

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

Add `ascAppId` to your existing `eas.json` under the build profile you want to use:

```json
{
  "build": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

> Find your `ascAppId` in App Store Connect → My Apps → select your app → copy the number from the URL.

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
5. Returns a direct link to track build progress

---

## Full workflow

```bash
# One-time setup
eba prebuild
git add ios/ && git commit -m "chore: ci scripts" && git push

# Every time you want to build
eba build
```

---

## Xcode Cloud Setup Guide

New to Xcode Cloud? See the step-by-step guide:
**[XCODE_CLOUD_GUIDE.md](https://github.com/kingasawa/eba-cli/blob/main/XCODE_CLOUD_GUIDE.md)**

---

## License

MIT
