import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from '@expo/apple-utils';
import { appleLogin } from '../auth/apple.js';

const { Teams, CookieFileCache } = pkg;

const ASC = 'https://appstoreconnect.apple.com';

// ─── Cookie-based fetch for App Store Connect ─────────────────────────────────

function getSessionCookieHeader() {
  const { cookies } = CookieFileCache.getCookiesJSON();
  if (!cookies?.length) throw new Error('No session cookies found. Please login again.');
  return cookies.map(c => `${c.key}=${c.value}`).join('; ');
}

async function ascFetch(path, { method = 'GET', body } = {}) {
  const cookieHeader = getSessionCookieHeader();

  const res = await fetch(`${ASC}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`App Store Connect API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return res.json();
}

// ─── Build command ────────────────────────────────────────────────────────────

export async function buildCommand(options) {
  const env = options.env ?? 'production';

  try {
    // 1. Read eas.json
    const configPath = resolve(process.cwd(), 'eas.json');
    if (!existsSync(configPath)) {
      console.error(chalk.red('\n✗ eas.json not found. Add ascAppId to your eas.json build profile.\n'));
      process.exit(1);
    }
    const easConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    const ascAppId = easConfig.build?.[env]?.ios?.ascAppId;
    if (!ascAppId) {
      console.error(chalk.red(`\n✗ build.${env}.ios.ascAppId is not set in eas.json\n`));
      process.exit(1);
    }

    // 2. Check for uncommitted ios/ changes
    try {
      const status = execFileSync('git', ['status', '--porcelain', 'ios/'], { cwd: process.cwd() }).toString().trim();
      if (status) {
        console.warn(chalk.yellow('\n⚠  Uncommitted changes detected in ios/:\n'));
        console.warn(chalk.dim(status));
        const { proceed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: 'ios/ has unpushed changes — Xcode Cloud will build from the last pushed commit. Continue anyway?',
          default: false,
        }]);
        if (!proceed) process.exit(0);
        console.log('');
      }
    } catch {
      // not a git repo or git not available — skip check
    }

    // 3. Login — restore session if < 1h, otherwise full login
    await appleLogin({ allowRestore: true });

    // 3. Select team
    const team = await Teams.selectTeamAsync();
    console.log(chalk.dim(`Team: ${team.name} (${team.teamId})\n`));

    // 4. Find Xcode Cloud product for app
    console.log(chalk.dim(`Looking up Xcode Cloud for app ${ascAppId}...`));

    const productsRes = await ascFetch(`/iris/v1/ciProducts?filter[app]=${ascAppId}`);
    const products = productsRes?.data ?? [];

    if (!products.length) {
      throw new Error(
        `No Xcode Cloud product found for app ID "${ascAppId}".\n` +
        '  Make sure Xcode Cloud is set up for this app in App Store Connect.'
      );
    }

    const productId = products[0].id;

    // 5. Get available workflows
    const workflowsRes = await ascFetch(`/iris/v1/ciProducts/${productId}/workflows`);
    const workflows = workflowsRes?.data ?? [];

    if (!workflows.length) {
      throw new Error(
        'No Xcode Cloud workflows found.\n' +
        '  Create at least one workflow in App Store Connect → Xcode Cloud.'
      );
    }

    // Use first workflow; future: support workflow selection via eas.json
    const workflow = workflows[0];
    const workflowName = workflow.attributes?.name ?? workflow.id;
    console.log(chalk.dim(`Workflow: ${workflowName}`));

    // 6. Start build
    console.log(chalk.dim('Starting build...\n'));

    await ascFetch('/iris/v1/ciBuildRuns', {
      method: 'POST',
      body: {
        data: {
          type: 'ciBuildRuns',
          relationships: {
            workflow: { data: { type: 'ciWorkflows', id: workflow.id } },
          },
        },
      },
    });

    const buildUrl = `${ASC}/apps/${ascAppId}/xcode-cloud`;

    console.log(chalk.bold('✅ Build started!\n'));
    console.log(`  ${chalk.cyan('Track your build:')}`);
    console.log(`  ${chalk.underline(buildUrl)}\n`);

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}
