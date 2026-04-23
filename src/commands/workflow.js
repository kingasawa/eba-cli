import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readAscAppId(env) {
  const easPath = resolve(process.cwd(), 'eas.json');
  if (!existsSync(easPath)) throw new Error('eas.json not found.');
  const config = JSON.parse(readFileSync(easPath, 'utf8'));
  return config.submit?.[env]?.ios?.ascAppId ?? config.build?.[env]?.ios?.ascAppId ?? null;
}

function readDefaultScheme() {
  try {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'app.json'), 'utf8'));
    return (config.expo ?? config).name ?? '';
  } catch { return ''; }
}

function getDefaultBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: process.cwd() })
      .toString().trim();
  } catch { return 'main'; }
}

function openBrowser(url) {
  try {
    const cmd = process.platform === 'win32' ? 'start' :
      process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFileSync(cmd, [url], { shell: process.platform === 'win32' });
  } catch {
    // silently ignore — URL is already printed to terminal
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function workflowCommand(options) {
  const env = options.env ?? 'production';

  try {
    // 1. Read app ID
    let ascAppId = null;
    try { ascAppId = readAscAppId(env); } catch {}

    if (!ascAppId) {
      const { id } = await inquirer.prompt([{
        type: 'input',
        name: 'id',
        message: 'App Store Connect App ID (numeric, from URL):',
        validate: v => /^\d+$/.test(v.trim()) ? true : 'Must be a numeric App ID',
      }]);
      ascAppId = id.trim();
    } else {
      console.log(chalk.dim(`Using App ID from eas.json: ${ascAppId}\n`));
    }

    // 2. Collect workflow configuration
    console.log(chalk.bold('\n📋 Workflow configuration\n'));
    console.log(chalk.dim('Answer a few questions — then we\'ll open App Store Connect\nand show you exactly what to fill in.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'workflowName',
        message: 'Workflow name:',
        default: 'Production Build',
        validate: v => Boolean(v.trim()) || 'Required',
      },
      {
        type: 'input',
        name: 'scheme',
        message: 'Xcode scheme (usually your app name):',
        default: readDefaultScheme() || undefined,
        validate: v => Boolean(v.trim()) || 'Required',
      },
      {
        type: 'list',
        name: 'startCondition',
        message: 'When should this workflow start?',
        choices: [
          { name: 'Manually (trigger via eba build or App Store Connect)', value: 'manual' },
          { name: 'On push to a branch', value: 'branch' },
          { name: 'On pull request', value: 'pr' },
          { name: 'On git tag', value: 'tag' },
        ],
        default: 'manual',
      },
      {
        type: 'input',
        name: 'branch',
        message: 'Branch to watch:',
        default: getDefaultBranch(),
        when: a => a.startCondition === 'branch',
        validate: v => Boolean(v.trim()) || 'Required',
      },
      {
        type: 'list',
        name: 'postAction',
        message: 'What to do after a successful build?',
        choices: [
          { name: 'Nothing', value: 'none' },
          { name: 'Upload to TestFlight (Internal Testing)', value: 'testflight_internal' },
          { name: 'Upload to TestFlight (External Testing)', value: 'testflight_external' },
        ],
        default: 'testflight_internal',
      },
      {
        type: 'confirm',
        name: 'cleanBuild',
        message: 'Enable clean build? (recommended)',
        default: true,
      },
    ]);

    // 3. Build checklist
    const branch = answers.branch ?? getDefaultBranch();
    const startConditionLabel = {
      manual: 'Manual',
      branch: `Push to branch: ${branch}`,
      pr: 'Pull request',
      tag: 'Git tag',
    }[answers.startCondition];

    const postActionLabel = {
      none: 'None',
      testflight_internal: 'TestFlight — Internal Testing',
      testflight_external: 'TestFlight — External Testing',
    }[answers.postAction];

    // 4. Print summary + checklist
    const url = `https://appstoreconnect.apple.com/apps/${ascAppId}/xcode-cloud`;

    console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    console.log(chalk.bold('🌐 Opening App Store Connect...\n'));
    console.log(chalk.dim(`  ${url}\n`));
    console.log(chalk.bold('📝 Fill in the following when creating the workflow:\n'));

    const fields = [
      ['Workflow name',    chalk.white(answers.workflowName)],
      ['Xcode version',    chalk.white('Latest Release (recommended)')],
      ['Clean build',      answers.cleanBuild ? chalk.green('✓ Enabled') : chalk.dim('Disabled')],
      ['Start condition',  chalk.white(startConditionLabel)],
      ['Archive scheme',   chalk.white(answers.scheme)],
      ['Post-build action',chalk.white(postActionLabel)],
    ];

    const labelWidth = Math.max(...fields.map(([l]) => l.length)) + 2;
    fields.forEach(([label, value]) => {
      console.log(`  ${chalk.dim((label + ':').padEnd(labelWidth))} ${value}`);
    });

    console.log('');
    console.log(chalk.dim('Steps in App Store Connect:'));
    console.log(chalk.dim('  1. Click "Manage Workflows" → "+" to add a new workflow'));
    console.log(chalk.dim('  2. Fill in the fields above'));
    console.log(chalk.dim('  3. Under Archive → select your scheme'));
    if (answers.postAction !== 'none') {
      console.log(chalk.dim('  4. Under Post-Actions → add TestFlight delivery'));
    }
    console.log(chalk.dim('  5. Save → then run: eba build\n'));

    console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    openBrowser(url);

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

