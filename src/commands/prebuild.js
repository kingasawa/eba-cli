import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

function readAppName(cwd) {
  const appJsonPath = join(cwd, 'app.json');
  const raw = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const name = (raw.expo ?? raw).name;
  if (!name) throw new Error('"name" field is missing in app.json.');
  return name;
}

// ─── ci_scripts templates ─────────────────────────────────────────────────────

function scriptPostClone(appName) {
  return `#!/bin/sh
set -e

echo "[ci_post_clone] Repository: $CI_PRIMARY_REPOSITORY_PATH"
echo "[ci_post_clone] Branch: \${CI_BRANCH:-unknown}"
echo "[ci_post_clone] Build: \${CI_BUILD_NUMBER:-unknown}"

cd "$CI_PRIMARY_REPOSITORY_PATH"

# ── Node.js ────────────────────────────────────────────────────────────────
if ! command -v node > /dev/null 2>&1; then
  for nvm_node in \\
    "/Users/local/.nvm/versions/node/$(ls /Users/local/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin" \\
    "/opt/homebrew/bin" \\
    "/usr/local/bin"; do
    if [ -x "$nvm_node/node" ]; then
      export PATH="$nvm_node:$PATH"
      break
    fi
  done
fi

if ! command -v node > /dev/null 2>&1; then
  echo "[ci_post_clone] node not found — installing via Homebrew..."
  brew install node@22
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

echo "[ci_post_clone] node: $(node -v)"
export NODE_BINARY=$(command -v node)

# ── npm ────────────────────────────────────────────────────────────────────
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
echo "[ci_post_clone] npm deps installed"

# ── CocoaPods ─────────────────────────────────────────────────────────────
if ! command -v pod > /dev/null 2>&1; then
  gem install --user-install cocoapods
  export PATH="$HOME/.gem/bin:$PATH"
fi

cd ios
export NODE_BINARY="$NODE_BINARY"
COCOAPODS_DISABLE_STATS=1 pod install --repo-update
echo "[ci_post_clone] pod install complete"

# ── Patch fmt 11.x consteval (Apple Clang 15+ / Xcode 15+) ────────────────
for FMT_HEADER in \\
  "Pods/fmt/include/fmt/base.h" \\
  "Pods/fmt/include/fmt/core.h" \\
  "Pods/fmt/include/fmt/format.h"; do
  if [ -f "$FMT_HEADER" ]; then
    sed -i.bak 's/#  define FMT_USE_CONSTEVAL 1/#  define FMT_USE_CONSTEVAL 0/g' "$FMT_HEADER"
    sed -i.bak 's/#define FMT_USE_CONSTEVAL 1/#define FMT_USE_CONSTEVAL 0/g' "$FMT_HEADER"
    rm -f "\${FMT_HEADER}.bak"
  fi
done

cp Podfile.lock Pods/Manifest.lock

PODS_XCCONFIG="Pods/Target Support Files/Pods-${appName}/Pods-${appName}.release.xcconfig"
if [ ! -f "$PODS_XCCONFIG" ]; then
  echo "[ci_post_clone] ERROR: $PODS_XCCONFIG not found after pod install"
  exit 1
fi

echo "[ci_post_clone] Done"
`;
}

function scriptPreXcodebuild(appName) {
  return `#!/bin/sh
set -e

echo "[ci_pre_xcodebuild] Build: \${CI_BUILD_NUMBER:-unset}"

cd "$CI_PRIMARY_REPOSITORY_PATH"
IOS_DIR="$CI_PRIMARY_REPOSITORY_PATH/ios"

PODS_XCCONFIG="$IOS_DIR/Pods/Target Support Files/Pods-${appName}/Pods-${appName}.release.xcconfig"
if [ ! -f "$PODS_XCCONFIG" ]; then
  echo "[ci_pre_xcodebuild] ERROR: Pods xcconfig missing"
  exit 1
fi

if diff "$IOS_DIR/Podfile.lock" "$IOS_DIR/Pods/Manifest.lock" > /dev/null 2>&1; then
  echo "[ci_pre_xcodebuild] Manifest.lock ok"
else
  echo "[ci_pre_xcodebuild] Manifest.lock differs — re-syncing"
  cp "$IOS_DIR/Podfile.lock" "$IOS_DIR/Pods/Manifest.lock"
fi

if [ -n "\${CI_BUILD_NUMBER:-}" ]; then
  cd "$IOS_DIR"
  xcrun agvtool new-version -all "$CI_BUILD_NUMBER"
fi

echo "[ci_pre_xcodebuild] Done"
`;
}

function scriptPostBuild() {
  return `#!/bin/sh
set -eu

echo "[ci_post_build] Build: \${CI_BUILD_NUMBER:-unset}"
echo "[ci_post_build] Product: \${CI_PRODUCT:-unset}"
echo "[ci_post_build] Workflow: \${CI_WORKFLOW:-unset}"

if [ -n "\${CI_ARCHIVE_PATH:-}" ]; then
  echo "[ci_post_build] Archive: $CI_ARCHIVE_PATH"
fi

if [ -n "\${CI_TESTFLIGHT_BUILD_NUMBER:-}" ]; then
  echo "[ci_post_build] TestFlight build: $CI_TESTFLIGHT_BUILD_NUMBER"
fi

echo "[ci_post_build] Done"
`;
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function prebuildCommand() {
  const cwd = process.cwd();

  try {
    const appName = readAppName(cwd);
    console.log(chalk.dim(`App: ${appName}\n`));

    const ciDir = join(cwd, 'ios', 'ci_scripts');
    mkdirSync(ciDir, { recursive: true });

    const scripts = [
      ['ci_post_clone.sh', scriptPostClone(appName)],
      ['ci_pre_xcodebuild.sh', scriptPreXcodebuild(appName)],
      ['ci_post_build.sh', scriptPostBuild()],
    ];

    for (const [filename, content] of scripts) {
      const filePath = join(ciDir, filename);
      writeFileSync(filePath, content, 'utf8');
      chmodSync(filePath, 0o755);
      console.log(chalk.dim(`  ✓ ios/ci_scripts/${filename}`));
    }

    console.log(chalk.bold('\n✅ Done! ios/ci_scripts/ generated.\n'));
    console.log(chalk.dim(`  Push ios/ to GitHub, then run ${chalk.white('eba build')} to start Xcode Cloud.\n`));

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}
