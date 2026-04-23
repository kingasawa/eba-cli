import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from '@expo/apple-utils';
import { appleLogin } from '../auth/apple.js';
import {
  findCiProductByAppId,
  listWorkflows,
  triggerBuildRun,
  getAscAppPageUrl,
} from '../api/asc.js';

const { Teams } = pkg;

// ─── Build command ────────────────────────────────────────────────────────────

export async function buildCommand(options) {
  const env = options.env ?? 'production';

  try {
    // 1. Read eas.json
    const configPath = resolve(process.cwd(), 'eas.json');
    if (!existsSync(configPath)) {
      console.error(chalk.red('\n✗ eas.json not found. Add ascAppId to your eas.json submit or build profile.\n'));
      process.exit(1);
    }
    const easConfig = JSON.parse(readFileSync(configPath, 'utf8'));

    // Try submit first (standard EAS), then build (alternative)
    const ascAppId = easConfig.submit?.[env]?.ios?.ascAppId
      ?? easConfig.build?.[env]?.ios?.ascAppId;

    if (!ascAppId) {
      console.error(chalk.red(
        `\n✗ No ascAppId found in eas.json\n` +
        `  Expected: submit.${env}.ios.ascAppId or build.${env}.ios.ascAppId\n` +
        `  Example:\n` +
        `    "submit": {\n` +
        `      "${env}": {\n` +
        `        "ios": { "ascAppId": "YOUR_APP_ID" }\n` +
        `      }\n` +
        `    }\n`
      ));
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

    const product = await findCiProductByAppId(ascAppId);
    if (!product) {
      throw new Error(
        `No Xcode Cloud product found for app ID "${ascAppId}".\n` +
        '  Make sure Xcode Cloud is set up for this app in App Store Connect.'
      );
    }

    const productId = product.id;

    // 5. Get available workflows
    const workflows = await listWorkflows(productId);

    if (!workflows.length) {
      throw new Error(
        'No Xcode Cloud workflows found.\n' +
        '  Create at least one workflow in App Store Connect → Xcode Cloud.'
      );
    }

    console.log(chalk.green(`✓ Found ${workflows.length} workflow(s):`));
    workflows.forEach((w, index) => {
      const name = w.attributes?.name ?? w.id;
      console.log(chalk.dim(`  [${index}] ${name} (${w.id})`));
    });

    // Always ask user to pick workflow, even if only one exists.
    const { workflowIndex } = await inquirer.prompt([{
      type: 'list',
      name: 'workflowIndex',
      message: 'Select workflow to trigger:',
      choices: workflows.map((w, index) => ({
        name: w.attributes?.name ?? w.id,
        value: index,
      })),
      default: 0,
    }]);

    const workflow = workflows[workflowIndex];
    const workflowName = workflow.attributes?.name ?? workflow.id;
    console.log(chalk.dim(`Selected workflow: ${workflowName}`));

    const { shouldTrigger } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldTrigger',
      message: `Trigger build with "${workflowName}" now?`,
      default: false,
    }]);

    if (!shouldTrigger) {
      console.log(chalk.dim('\nBuild cancelled by user.\n'));
      return;
    }

    // 6. Start build
    console.log(chalk.dim('Starting build...\n'));

    await triggerBuildRun(workflow.id);

    const buildUrl = getAscAppPageUrl(ascAppId);

    console.log(chalk.bold('✅ Build started!\n'));
    console.log(`  ${chalk.cyan('Track your build:')}`);
    console.log(`  ${chalk.underline(buildUrl)}\n`);

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}
