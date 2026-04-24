# eba-cli — Xcode Cloud CLI for Expo & React Native

[![npm version](https://img.shields.io/npm/v/eba-cli.svg)](https://www.npmjs.com/package/eba-cli)
[![npm downloads](https://img.shields.io/npm/dm/eba-cli.svg)](https://www.npmjs.com/package/eba-cli)
[![license](https://img.shields.io/npm/l/eba-cli.svg)](LICENSE)
![GitHub Sponsors](https://img.shields.io/github/sponsors/kingasawa)


**Trigger iOS builds on Xcode Cloud from your terminal — no Mac, no browser, no EAS build limits.**  
Works on Windows, macOS, and Linux. Built for Expo and React Native developers.

---

## 😤 The Problem

You're building an iOS app with **Expo or React Native**.  
You hit the **EAS free build limit — 15 builds/month** — and you're not ready to pay $99+/month for EAS Production.

Or maybe you're looking for a **free EAS Build alternative** that doesn't require buying a Mac or setting up GitHub Actions from scratch.

Meanwhile, Apple gives every developer **25 compute hours/month of Xcode Cloud for free** — that's roughly **75–100 iOS builds/month** — just sitting there, unused.

The catch? Xcode Cloud is designed to be managed through Xcode IDE or App Store Connect web UI. There's no official CLI. Setting it up manually is slow and repetitive.

---

## ✅ The Solution

**`eba-cli`** is a CLI tool that automates Xcode Cloud for Expo & React Native developers.

```bash
npm install -g eba-cli
```

One-time setup:
```bash
eba prebuild   # generate Xcode Cloud CI scripts
eba workflow   # create workflow via API — no browser needed
```

Then trigger builds from anywhere:
```bash
eba build
```

That's it. No Xcode. No browser. No manual clicking.

---

## 🤔 Why eba-cli instead of EAS Build?

| | EAS Build (Free) | Xcode Cloud (via eba-cli) |
|---|---|---|
| iOS builds/month | 15 | ~75–100* |
| Cost | Free → $99+/mo after limit | Free with Apple Developer ($99/yr) |
| Setup | None | One-time CLI setup (`eba workflow`) |
| Customization | Limited | Full control via `ci_scripts` |
| Requires Mac | No | No — works on Windows & Linux too |
| Requires Xcode | No | No |

*Based on ~15 min average build time within 25 compute hours/month.

> **In short:** If you're already paying for Apple Developer ($99/yr), Xcode Cloud is included. Use it.

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18
- Apple Developer account ($99/yr)
- Your app registered on App Store Connect
- Xcode Cloud enabled: App Store Connect → your app → Xcode Cloud → Get Started

### Step 1 — Install

```bash
npm install -g eba-cli
```

### Step 2 — Add your App ID to `eas.json`

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

> Find your `ascAppId`: App Store Connect → My Apps → select your app → copy the number from the URL.

### Step 3 — Generate CI scripts

```bash
eba prebuild
git add ios/ && git commit -m "chore: add xcode cloud ci scripts" && git push
```

### Step 4 — Create your Xcode Cloud workflow

```bash
eba workflow
```

This will:
1. Log in to your Apple account and create an ASC API key (first run only — saved locally)
2. Detect your app and connected GitHub repository
3. Ask a few questions (workflow name, scheme, branch trigger, TestFlight distribution)
4. Create the workflow via API and print a direct link

```
✅ Workflow created successfully!

  Name:    Production Build
  ID:      xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Track:   https://appstoreconnect.apple.com/teams/.../apps/.../ci/workflows/...

Run "eba build" to trigger your first build.
```

### Step 5 — Trigger builds

```bash
eba build
```

---

## 📖 All Commands

### `eba build`
Trigger an Xcode Cloud build from your terminal.
```bash
eba build
eba build --env production
```

### `eba prebuild`
Generate `ios/ci_scripts/` required by Xcode Cloud.
```bash
eba prebuild
```
Creates:
- `ci_post_clone.sh` — installs Node, npm deps, CocoaPods
- `ci_pre_xcodebuild.sh` — syncs Manifest.lock, sets build number
- `ci_post_build.sh` — logs build metadata

### `eba workflow`
Create an Xcode Cloud workflow via API.
```bash
eba workflow           # create new workflow
eba workflow --setup   # re-run API key setup
```

### `eba devices`
List or register iOS/iPadOS devices.
```bash
eba devices            # list all
eba devices --register # register via QR code or manual UDID
```

**QR code flow:** CLI starts a local server → scan with iPhone → install profile → UDID captured automatically.

### `eba certs`
List or revoke iOS certificates.
```bash
eba certs
eba certs --revoke
```

### `eba profiles`
List or delete iOS provisioning profiles.
```bash
eba profiles
eba profiles --delete
```

### `eba bundle-ids`
List or register bundle IDs.
```bash
eba bundle-ids
eba bundle-ids --filter com.example
eba bundle-ids --capabilities
eba bundle-ids --register
```

---

## 💡 Bonus Tips

**Auto-build on push to `main`:**  
During `eba workflow`, choose "On push to a branch" → `main`. Every PR merge will trigger a build automatically — no need to run `eba build` manually.

**Re-trigger a build without new code:**  
```bash
eba build   # retriggers from current HEAD — useful to retry a failed build
```

**Apple ID session caching:**  
Apple login is cached for 1 hour. You won't be prompted again within that window.

**TestFlight distribution:**  
During `eba workflow`, choose "TestFlight Internal Testing" or "TestFlight & External Testing" — the workflow will automatically prepare your build for distribution after archiving.

---

## ☕ Support

Did this tool save you time or money?  
If it helped you dodge the EAS build limit, avoid buying a Mac, or just made your day a little easier — a coffee would mean a lot.

👉 **[github.com/sponsors/kingasawa](https://github.com/sponsors/kingasawa)**

Your support keeps this project alive and the AI fed. Thank you ☕

---

## ❓ FAQ

**Q: Can I use eba-cli on Windows or Linux without a Mac?**  
Yes. `eba-cli` runs on any OS that has Node.js. You do not need Xcode or a Mac to trigger builds — Xcode Cloud runs on Apple's servers.

**Q: Do I need an Apple Developer account?**  
Yes. Apple Developer Program membership ($99/year) is required to use Xcode Cloud. The compute hours are included at no extra cost.

**Q: How is this different from EAS Build?**  
EAS Build is a paid service by Expo. The free tier is limited to 15 iOS builds/month. `eba-cli` uses Xcode Cloud — Apple's own CI/CD, free with your Developer account — and gives you a CLI interface to manage it.

**Q: How is this different from GitHub Actions?**  
GitHub Actions for iOS requires a macOS runner (~$0.08/min), which adds up fast. Xcode Cloud compute hours are already included in your Apple Developer subscription with no per-minute cost.

**Q: Is eba-cli an official Apple tool?**  
No. It's an open-source CLI that uses the official App Store Connect REST API to automate Xcode Cloud workflow management.

**Q: What happens after I hit EAS free build limit?**  
You can switch to `eba-cli` + Xcode Cloud. Run `eba workflow` once to set up, then `eba build` to trigger builds — same experience, no extra cost.

**Q: Does it support React Native (non-Expo) projects?**  
Yes, as long as you have an `.xcworkspace` or `.xcodeproj` file in your `ios/` folder.

**Q: What is the `eba prebuild` command for?**  
It generates the `ci_scripts/` folder that Xcode Cloud requires to install Node.js dependencies and CocoaPods during the build process. Without it, the build will fail at the dependency install step.

---

## License

MIT + Commons Clause — free to use for personal and commercial projects. You may not republish or sell this tool as your own.

---

## Changelog

### v1.2.2
- **`eba workflow` fully automated** — workflow creation now happens entirely via the App Store Connect API. No more manual steps in Xcode or the browser.
- Auto-creates an ASC API key on first run (saved locally, reused automatically)
- Detects your Xcode Cloud product and connected GitHub repository
- Supports connecting a new GitHub repository directly from the CLI prompt
- Polls for repository access confirmation automatically after GitHub OAuth
- Prints a direct link to the created workflow on App Store Connect

### v1.2.1
- `eba workflow` provided a step-by-step guide to create workflows manually via App Store Connect web UI

### v1.2
- `eba prebuild` generates `ci_scripts/` required by Xcode Cloud for Expo & React Native projects

### v1.0 
- Initial release — trigger Xcode Cloud builds from your terminal with `eba build` after manual workflow setup