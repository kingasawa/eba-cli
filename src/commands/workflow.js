import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  loadApiKeyCreds, saveApiKeyCreds, generateJwt, getCredsFilePath,
  getCiProduct, getScmRepositories,
  getXcodeVersions, getMacOsVersions,
  createCiWorkflow,
} from '../api/asc-api.js';

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

// ─── Auto-setup API key via Apple login ───────────────────────────────────────

async function autoSetupApiKey() {
  console.log(chalk.bold('\n🔑 App Store Connect API Key Setup\n'));

  // Open browser to ASC API Keys page
  const url = 'https://appstoreconnect.apple.com/access/integrations/api';
  console.log(chalk.dim('  Opening App Store Connect → Users and Access → Integrations → API Keys...\n'));
  try {
    const cmd = process.platform === 'win32' ? 'start' :
      process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFileSync(cmd, [url], { shell: process.platform === 'win32' });
  } catch {}

  console.log(chalk.bold('  Steps to create a key:\n'));
  console.log(chalk.dim('  1. Click the "+" button (or "Generate API Key")'));
  console.log(chalk.dim('  2. Name: eba-cli  |  Role: Admin'));
  console.log(chalk.dim('  3. Click Generate → Download the .p8 file (only available once!)'));
  console.log(chalk.dim('  4. Note the Issuer ID shown at the top of the page'));
  console.log(chalk.dim('  5. Note the Key ID shown in the key list\n'));

  const { ready } = await inquirer.prompt([{
    type: 'confirm',
    name: 'ready',
    message: 'Downloaded the .p8 file and have the Issuer ID + Key ID ready?',
    default: false,
  }]);

  if (!ready) {
    console.log(chalk.dim('\nRun "eba workflow --setup" again when ready.\n'));
    process.exit(0);
  }

  const { issuerId, keyId, privateKeyPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'issuerId',
      message: 'Issuer ID (UUID at top of the Keys page):',
      validate: v => Boolean(v.trim()) || 'Required',
    },
    {
      type: 'input',
      name: 'keyId',
      message: 'Key ID (shown in key list):',
      validate: v => Boolean(v.trim()) || 'Required',
    },
    {
      type: 'input',
      name: 'privateKeyPath',
      message: 'Path to the downloaded .p8 file:',
      default: `~/Downloads/AuthKey_${'{KEY_ID}'}.p8`,
      validate: v => {
        const p = v.trim().replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? '');
        return existsSync(p) ? true : `File not found: ${p}`;
      },
    },
  ]);

  const normalizedPath = privateKeyPath.trim()
    .replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? '');

  saveApiKeyCreds({
    issuerId: issuerId.trim(),
    keyId: keyId.trim(),
    privateKeyPath: normalizedPath,
  });

  console.log(chalk.green(`\n✓ Credentials saved to ${getCredsFilePath()}\n`));

  return {
    issuerId: issuerId.trim(),
    keyId: keyId.trim(),
    privateKey: readFileSync(normalizedPath, 'utf8'),
  };
}

// ─── Ensure API key creds (check file or auto-setup) ──────────────────────────

async function ensureApiKeyCreds(setupMode = false) {
  const creds = loadApiKeyCreds();

  if (creds) {
    console.log(chalk.green(`✓ Found existing credentials (${getCredsFilePath()})`));
    console.log(chalk.dim(`  Key ID: ${creds.keyId}  |  Issuer: ${creds.issuerId}\n`));
    return creds;
  }

  if (!setupMode) {
    console.log(chalk.yellow('⚠ No credentials found. Run "eba workflow --setup" to auto-configure.\n'));
    process.exit(1);
  }

  // Auto-setup via Apple login
  return autoSetupApiKey();
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function workflowCommand(options) {
  const env = options.env ?? 'production';
  const setupMode = Boolean(options.setup);

  try {
    // 1. Get App ID
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
      console.log(chalk.dim(`App ID from eas.json: ${ascAppId}\n`));
    }

    // 2. Get / setup API key
    const creds = await ensureApiKeyCreds(setupMode);
    const jwt = generateJwt(creds);

    // 3. Find CI product
    console.log(chalk.dim('Looking up Xcode Cloud product...'));
    const product = await getCiProduct(jwt, ascAppId);
    if (!product) {
      throw new Error(
        `No Xcode Cloud product found for app ${ascAppId}.\n` +
        '  Go to App Store Connect → your app → Xcode Cloud → Get Started first.'
      );
    }
    console.log(chalk.green(`✓ Xcode Cloud product: ${product.attributes?.name ?? product.id}`));

    // 4. Find repository
    console.log(chalk.dim('Fetching connected repositories...'));
    const repos = await getScmRepositories(jwt);
    if (!repos.length) {
      throw new Error(
        'No repositories connected to App Store Connect.\n' +
        '  Connect your GitHub/Bitbucket/GitLab repo in App Store Connect → Xcode Cloud first.'
      );
    }

    let repoId;
    if (repos.length === 1) {
      repoId = repos[0].id;
      console.log(chalk.green(`✓ Repository: ${repos[0].attributes?.repositoryName ?? repos[0].id}`));
    } else {
      const { idx } = await inquirer.prompt([{
        type: 'list',
        name: 'idx',
        message: 'Select repository:',
        choices: repos.map((r, i) => ({
          name: `${r.attributes?.ownerName ?? ''}/${r.attributes?.repositoryName ?? r.id}`,
          value: i,
        })),
      }]);
      repoId = repos[idx].id;
    }

    // 5. Xcode + macOS versions
    console.log(chalk.dim('Fetching available Xcode versions...'));
    const xcodeVersions = await getXcodeVersions(jwt);
    const macOsVersions = await getMacOsVersions(jwt);

    // Pick latest recommended by default
    const latestXcode = xcodeVersions.find(v => v.attributes?.isLatestRelease) ?? xcodeVersions[0];
    const latestMacOs = macOsVersions[0];

    if (!latestXcode) throw new Error('No Xcode versions available in your account.');

    const { xcodeIdx } = await inquirer.prompt([{
      type: 'list',
      name: 'xcodeIdx',
      message: 'Xcode version:',
      choices: xcodeVersions.map((v, i) => ({
        name: `${v.attributes?.version ?? v.id}${v.attributes?.isLatestRelease ? ' (latest)' : ''}`,
        value: i,
      })),
      default: xcodeVersions.indexOf(latestXcode),
    }]);
    const xcodeVersionId = xcodeVersions[xcodeIdx].id;

    const { macOsIdx } = await inquirer.prompt([{
      type: 'list',
      name: 'macOsIdx',
      message: 'macOS version:',
      choices: macOsVersions.map((v, i) => ({
        name: v.attributes?.version ?? v.id,
        value: i,
      })),
      default: 0,
    }]);
    const macOsVersionId = macOsVersions[macOsIdx].id;

    // 6. Workflow configuration
    console.log(chalk.bold('\n📋 Workflow configuration\n'));

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
          { name: 'Manually only', value: 'manual' },
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
        type: 'confirm',
        name: 'testflight',
        message: 'Upload to TestFlight (Internal Testing) after successful build?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'cleanBuild',
        message: 'Enable clean build? (recommended)',
        default: true,
      },
    ]);

    // Build start condition objects
    const branch = answers.branch ?? getDefaultBranch();
    let branchStartCondition = null;
    let tagStartCondition = null;
    let pullRequestStartCondition = null;
    let manualBranchStartCondition = null;

    if (answers.startCondition === 'branch') {
      branchStartCondition = {
        source: { patterns: [{ pattern: branch, isPrefix: false }], patternType: 'EXACT' },
        autoCancel: true,
        filesAndFoldersRule: null,
      };
    } else if (answers.startCondition === 'tag') {
      tagStartCondition = {
        source: { patterns: [{ pattern: '*', isPrefix: true }], patternType: 'GLOB' },
        autoCancel: false,
        filesAndFoldersRule: null,
      };
    } else if (answers.startCondition === 'pr') {
      pullRequestStartCondition = {
        source: { patterns: [{ pattern: '*', isPrefix: true }], patternType: 'GLOB' },
        destination: { patterns: [{ pattern: branch, isPrefix: false }], patternType: 'EXACT' },
        autoCancel: true,
        filesAndFoldersRule: null,
      };
    } else {
      manualBranchStartCondition = {
        source: { patterns: [{ pattern: branch, isPrefix: false }], patternType: 'EXACT' },
      };
    }

    // 7. Create workflow
    console.log(chalk.dim('\nCreating workflow via App Store Connect API...\n'));

    const workflow = await createCiWorkflow(jwt, {
      productId: product.id,
      repositoryId: repoId,
      xcodeVersionId,
      macOsVersionId,
      name: answers.workflowName,
      scheme: answers.scheme,
      clean: answers.cleanBuild,
      branchStartCondition,
      tagStartCondition,
      pullRequestStartCondition,
      manualBranchStartCondition,
      postTestFlightInternalTesting: answers.testflight,
    });

    if (!workflow) throw new Error('Workflow created but no data returned.');

    console.log(chalk.bold('\n✅ Workflow created successfully!\n'));
    console.log(`  ${chalk.white('Name:')}    ${workflow.attributes?.name ?? answers.workflowName}`);
    console.log(`  ${chalk.white('ID:')}      ${chalk.dim(workflow.id)}`);
    console.log(`  ${chalk.white('Track:')}   ${chalk.underline(`https://appstoreconnect.apple.com/apps/${ascAppId}/xcode-cloud`)}\n`);
    console.log(chalk.dim('Run "eba build" to trigger your first build.\n'));

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

