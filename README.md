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
| Setup required | None                    | One-time CLI setup (`eba workflow`) |
| Customization | Limited                 | Full control via ci_scripts |

*Based on ~15 min average build time within 25 compute hours/month.

---

## Installation

```bash
npm install -g eba-cli
```

**Requirements:** Node.js >= 18, Apple Developer account, Xcode Cloud enabled on App Store Connect.

---

## Quick Start

```bash
# 1. Generate Xcode Cloud CI scripts
eba prebuild

# 2. Push ios/ folder to GitHub
git add ios/ && git commit -m "chore: add xcode cloud ci scripts" && git push

# 3. Create your Xcode Cloud workflow (fully automated)
eba workflow

# 4. Trigger a build anytime
eba build
```

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
eba prebuild
```

Creates:
- `ios/ci_scripts/ci_post_clone.sh` — installs Node, npm deps, CocoaPods after repo clone
- `ios/ci_scripts/ci_pre_xcodebuild.sh` — syncs Manifest.lock, sets build number
- `ios/ci_scripts/ci_post_build.sh` — logs build metadata

After running, push `ios/` to GitHub before creating a workflow:

```bash
git add ios/
git commit -m "chore: add xcode cloud ci scripts"
git push
```

---

### `eba workflow`

Creates a full Xcode Cloud workflow automatically via the App Store Connect API — no browser needed.

```bash
eba workflow
```

What it does:
1. Logs in to your Apple account and sets up an ASC API key (first run only)
2. Reads your `ascAppId` from `eas.json`
3. Finds the Xcode Cloud product linked to your app
4. Detects your connected GitHub/GitLab/Bitbucket repository
5. Prompts for workflow name, Xcode version, scheme, branch/tag/PR trigger, and distribution
6. Creates the workflow and prints a direct link to it

```
✅ Workflow created successfully!

  Name:    Production Build
  ID:      xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Track:   https://appstoreconnect.apple.com/teams/.../apps/.../ci/workflows/...

Run "eba build" to trigger your first build.
```

**First-time setup:** On the first run, `eba workflow` will guide you through creating an App Store Connect API key. The key is saved locally and reused automatically on future runs.

**Prerequisites before running `eba workflow`:**
- Your app must be registered on App Store Connect
- Xcode Cloud must be enabled (App Store Connect → your app → Xcode Cloud → Get Started)
- Your repository must be connected to App Store Connect (Integrations → Xcode Cloud → Grant GitHub access)

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
eba workflow

# Trigger a build manually anytime
eba build
```

> **Tip:** If your Xcode Cloud workflow has a **push trigger on `main`**, you don't need to run `eba build` at all.
> Simply merge your PR into `main` and Xcode Cloud will start the build automatically.
> Use `eba build` when you want to re-trigger a build from the same commit — for example to retry a failed build without pushing new code.

---


## License

MIT
