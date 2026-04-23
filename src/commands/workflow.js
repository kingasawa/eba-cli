import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from '@expo/apple-utils';
import { appleLogin } from '../auth/apple.js';
import {
  loadApiKeyCreds, saveApiKeyCreds, generateJwt, getCredsFilePath,
  getCiProduct, getScmRepositories,
  getXcodeVersions, getMacOsVersions,
  createCiWorkflow,
} from '../api/asc-api.js';

const { ApiKey, ApiKeyType, Teams } = pkg;

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
  // 1. Login with Apple
  console.log(chalk.bold('\n🍎 Logging in to Apple Developer account...\n'));
  const baseAuthState = await appleLogin({ allowRestore: true });
  const team = await Teams.selectTeamAsync();
  console.log(chalk.dim(`Team: ${team.name} (${team.teamId})\n`));

  // Connect API uses providerId (numeric), provisioning uses teamId (string)
  // After Teams.selectTeamAsync(), baseAuthState.context has both set correctly
  const context = baseAuthState.context;

  // 2. Check for existing keys & try to get issuerId
  let issuerId = null;
  try {
    const existingKeys = await ApiKey.getAsync(context) ?? [];
    if (existingKeys.length > 0) {
      // issuerId is not in the key model directly — try provider info
      const provider = existingKeys[0]?.attributes?.provider ?? existingKeys[0]?.provider;
      issuerId = provider?.id ?? null;
      if (process.env.DEBUG) console.log('Existing keys:', JSON.stringify(existingKeys[0], null, 2));
    }
  } catch (e) {
    if (process.env.DEBUG) console.log('Could not fetch existing keys:', e.message);
  }

  // 3. Create a new ASC API key
  console.log(chalk.dim('Creating App Store Connect API key (PUBLIC_API)...\n'));
  let newKey;
  try {
    newKey = await ApiKey.createAsync(context, {
      nickname: 'eba-cli',
      roles: ['ADMIN'],
      allAppsVisible: true,
      keyType: ApiKeyType.PUBLIC_API,
    });
  } catch (err) {
    throw new Error(`Failed to create API key: ${err.message}`);
  }

  const keyId = newKey.id;
  if (!keyId) throw new Error('API key created but Key ID not returned.');
  console.log(chalk.green(`✓ API key created: ${keyId}`));

  // 4. Download private key — only available right after creation
  console.log(chalk.dim('Downloading private key (.p8)...'));
  let privateKeyContent;
  try {
    privateKeyContent = await newKey.downloadAsync();
  } catch (err) {
    throw new Error(`Failed to download private key: ${err.message}`);
  }
  if (!privateKeyContent) throw new Error('Private key returned empty. Download it manually from App Store Connect.');

  // Save .p8 file
  const keysDir = join(homedir(), '.eba-cli', 'keys');
  mkdirSync(keysDir, { recursive: true });
  const privateKeyPath = join(keysDir, `AuthKey_${keyId}.p8`);
  writeFileSync(privateKeyPath, privateKeyContent, 'utf8');
  console.log(chalk.green(`✓ Private key saved: ${privateKeyPath}`));

  // 5. Issuer ID — prompt if not auto-detected
  if (!issuerId) {
    console.log(chalk.yellow('\n⚠ Could not auto-detect Issuer ID.'));
    console.log(chalk.dim('  Find it on: App Store Connect → Users and Access → Integrations → App Store Connect API'));
    console.log(chalk.dim('  It is the UUID shown at the top of the page.\n'));
    try {
      const cmd = process.platform === 'win32' ? 'start' :
        process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFileSync(cmd, ['https://appstoreconnect.apple.com/access/integrations/api'],
        { shell: process.platform === 'win32' });
    } catch {}
    const { inputIssuerId } = await inquirer.prompt([{
      type: 'input',
      name: 'inputIssuerId',
      message: 'Issuer ID (UUID):',
      validate: v => Boolean(v.trim()) || 'Required',
    }]);
    issuerId = inputIssuerId.trim();
  } else {
    console.log(chalk.green(`✓ Issuer ID: ${issuerId}`));
  }

  // 6. Save credentials
  saveApiKeyCreds({ issuerId, keyId, privateKeyPath });
  console.log(chalk.green(`\n✓ Credentials saved to ${getCredsFilePath()}\n`));

  return { issuerId, keyId, privateKey: privateKeyContent };
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

    // 5. Xcode + macOS versions — auto-pick latest, ask only if user wants to change
    console.log(chalk.dim('Fetching available Xcode versions...'));
    const xcodeVersions = await getXcodeVersions(jwt);
    const macOsVersions = await getMacOsVersions(jwt);

    const latestXcode = xcodeVersions.find(v => v.attributes?.isLatestRelease) ?? xcodeVersions[0];
    const latestMacOs = macOsVersions[0];

    if (!latestXcode) throw new Error('No Xcode versions available in your account.');

    console.log(chalk.green(`✓ Xcode: ${latestXcode.attributes?.version ?? latestXcode.id} (latest)`));
    console.log(chalk.green(`✓ macOS: ${latestMacOs?.attributes?.version ?? latestMacOs?.id ?? 'latest'}\n`));

    const { customizeVersions } = await inquirer.prompt([{
      type: 'confirm',
      name: 'customizeVersions',
      message: 'Change Xcode/macOS version? (No = use latest recommended)',
      default: false,
    }]);

    let xcodeVersionId = latestXcode.id;
    let macOsVersionId = latestMacOs?.id;

    if (customizeVersions) {
      const { xcodeIdx } = await inquirer.prompt([{
        type: 'list',
        name: 'xcodeIdx',
        message: 'Select Xcode version:',
        choices: xcodeVersions.map((v, i) => ({
          name: `Xcode ${v.attributes?.version ?? v.id}${v.attributes?.isLatestRelease ? ' ← latest (recommended)' : ''}`,
          value: i,
        })),
        default: xcodeVersions.indexOf(latestXcode),
      }]);
      xcodeVersionId = xcodeVersions[xcodeIdx].id;

      const { macOsIdx } = await inquirer.prompt([{
        type: 'list',
        name: 'macOsIdx',
        message: 'Select macOS version:',
        choices: macOsVersions.map((v, i) => ({
          name: `macOS ${v.attributes?.version ?? v.id}${i === 0 ? ' ← latest (recommended)' : ''}`,
          value: i,
        })),
        default: 0,
      }]);
      macOsVersionId = macOsVersions[macOsIdx].id;
    }

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
        type: 'input',
        name: 'containerFilePath',
        message: 'Path to .xcworkspace or .xcodeproj (relative to repo root):',
        default: (() => {
          const scheme = readDefaultScheme();
          return scheme ? `ios/${scheme}.xcworkspace` : 'ios/MyApp.xcworkspace';
        })(),
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
        name: 'cleanBuild',
        message: 'Enable clean build? (recommended)',
        default: true,
      },
    ]);

    // Build start condition objects — patternType is NOT valid in the API
    const branch = answers.branch ?? getDefaultBranch();
    let branchStartCondition = null;
    let tagStartCondition = null;
    let pullRequestStartCondition = null;
    let manualBranchStartCondition = null;

    if (answers.startCondition === 'branch') {
      branchStartCondition = {
        source: { patterns: [{ pattern: branch, isPrefix: false }] },
        autoCancel: true,
      };
    } else if (answers.startCondition === 'tag') {
      tagStartCondition = {
        source: { patterns: [{ pattern: '*', isPrefix: true }] },
        autoCancel: false,
      };
    } else if (answers.startCondition === 'pr') {
      pullRequestStartCondition = {
        source: { patterns: [{ pattern: '*', isPrefix: true }] },
        destination: { patterns: [{ pattern: branch, isPrefix: false }] },
        autoCancel: true,
      };
    } else {
      manualBranchStartCondition = {
        source: { patterns: [{ pattern: branch, isPrefix: false }] },
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
      containerFilePath: answers.containerFilePath,
      clean: answers.cleanBuild,
      branchStartCondition,
      tagStartCondition,
      pullRequestStartCondition,
      manualBranchStartCondition,
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

