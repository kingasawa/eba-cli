# Xcode Cloud Build Guide

Xcode Cloud is Apple's built-in CI/CD service, integrated directly into App Store Connect. It gives you **25 free compute hours/month** with an Apple Developer account — enough for ~75–100 iOS builds per month.

---

## Prerequisites

- [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year)
- App created on [App Store Connect](https://appstoreconnect.apple.com)
- Source code hosted on GitHub, Bitbucket, or GitLab
- Xcode 13+ installed on your Mac

---

## Step 1 — Connect your repository to App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → **Xcode Cloud**
2. Select your app → click **Get Started**
3. Xcode Cloud will ask to connect your source control provider
4. Authorize GitHub (or Bitbucket / GitLab) and select your repository

---

## Step 2 — Create a Workflow

A workflow defines how your app is built (which branch, which scheme, what happens after).

1. In App Store Connect → Xcode Cloud → your app → **Manage Workflows**
2. Click **+** to create a new workflow
3. Configure:

| Field | Recommended value |
|---|---|
| Name | `Production Build` |
| Environment | Latest Xcode version |
| Clean Build | Enabled |
| Start Condition | Manual (or push to `main`) |

4. Under **Archive** → select your app scheme (usually the app name)
5. Under **Post-Actions** → optionally add **TestFlight Internal Testing** for automatic uploads
6. Click **Save**

---

## Step 3 — Code Signing

Xcode Cloud can manage certificates and provisioning profiles automatically.

1. In your workflow → **Environment** → enable **Xcode Managed Signing**
2. On the first build, Xcode Cloud creates the certificate and profile automatically
3. If it fails: go to **App Store Connect → Users and Access → Integrations** and verify Xcode Cloud permissions

---

## Step 4 — Generate ci_scripts with eba-cli

Xcode Cloud needs shell scripts in `ios/ci_scripts/` to install Node.js and CocoaPods before building a React Native / Expo app.

```bash
# Run from your project root
eba prebuild
```

This creates:

```
ios/
  ci_scripts/
    ci_post_clone.sh      ← runs after repo clone: installs npm deps + pods
    ci_pre_xcodebuild.sh  ← runs before build: syncs Manifest.lock, sets build number
    ci_post_build.sh      ← runs after build: logs metadata
```

Push to GitHub before triggering a build:

```bash
git add ios/ci_scripts/
git commit -m "chore: add xcode cloud ci scripts"
git push
```

---

## Step 5 — Add ascAppId to eas.json

`eba build` needs to know which App Store Connect app to build.

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → select your app
2. Copy the numeric ID from the URL: `https://appstoreconnect.apple.com/apps/`**`1234567890`**`/...`

Add it to `eas.json`:

```json
{
  "build": {
    "production": {
      "ios": {
        "ascAppId": "1234567890"
      }
    }
  }
}
```

---

## Step 6 — Trigger a build

```bash
eba build
```

1. Enter your Apple ID credentials (session cached for 1 hour)
2. Select your team if you belong to multiple
3. Build is triggered automatically
4. A tracking URL is printed:

```
✅ Build started!

  Track your build:
  https://appstoreconnect.apple.com/apps/1234567890/xcode-cloud
```

---

## Troubleshooting

### Build fails at `pod install`

`ci_post_clone.sh` cannot find Node.js. The script tries common nvm and Homebrew paths automatically. If your setup is different, open the generated script and add your Node path manually.

### `No Xcode Cloud product found`

- Xcode Cloud is not enabled for this app yet → go to App Store Connect → your app → **Xcode Cloud** → Get Started
- Or `ascAppId` in `eas.json` is incorrect

### `No workflows found`

- No workflow has been created yet → follow Step 2 above

### Code signing errors

- Go to App Store Connect → Xcode Cloud → Settings → verify permissions
- Make sure the bundle ID in `Info.plist` matches the app on App Store Connect exactly

### Session expired

`eba build` caches your Apple ID session for 1 hour. After that it prompts for login automatically.

---

## EAS Free vs Xcode Cloud

| | EAS Build (Free) | Xcode Cloud |
|---|---|---|
| Monthly limit | 30 builds | 25 compute hours (~75–100 builds) |
| Average build time | 5–10 min | 10–20 min |
| Setup | None | One-time (Steps 1–5 above) |
| Customization | Limited | Full control via ci_scripts |
| Build logs | EAS Dashboard | App Store Connect |
| TestFlight upload | Automatic | Automatic (if configured) |
| Cost beyond free tier | Pay per build | N/A — included with $99/yr membership |
