import inquirer from 'inquirer';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import pkg from '@expo/apple-utils';
import { appleLogin } from '../auth/apple.js';
import { listApiKeys, createApiKey, downloadPrivateKey } from '../api/asc.js';
import { writeAppleInfo } from '../utils/writer.js';

const { Teams } = pkg;

export async function getKeyCommand(options) {
  const outputPath = options.output ?? 'apple info.md';

  try {
    // Step 1: Login
    await appleLogin();

    // Step 2: Select team — portalRequestAsync requires an object with .teamId
    console.log(chalk.dim('\nSelecting team...'));
    const team = await Teams.selectTeamAsync();
    console.log(chalk.dim(`Team: ${team.name} (${team.teamId})`));

    // Step 3: List existing API keys
    console.log(chalk.dim('\nFetching API keys from App Store Connect...'));
    const keys = await listApiKeys(team);

    console.log(`  keys   = ${chalk.cyan(JSON.stringify(keys))}`);

    // const issuerId = keys[0]?.issuerId ?? null;

    // if (!issuerId) {
    //   throw new Error(
    //     'Could not retrieve Issuer ID. ' +
    //     'Make sure your Apple ID has Account Holder or Admin role in App Store Connect.'
    //   );
    // }

    // console.log(chalk.dim(`Issuer ID: ${issuerId}`));

    let keyId;
    let privateKey;

    if (keys.length === 0) {
      console.log(chalk.yellow('\nNo API keys found. A new key will be created.'));
      ({ keyId, privateKey } = await createNewKey(team));
    } else {
      ({ keyId, privateKey } = await selectOrCreateKey(team, keys));
    }

    writeAppleInfo(outputPath, { keyId, privateKey });

    console.log(chalk.bold('\n✅ Done!\n'));
    console.log(`  APPLE_KEY_ID      = ${chalk.cyan(keyId)}`);
    // console.log(`  APPLE_ISSUER_ID   = ${chalk.cyan(issuerId)}`);
    console.log(`  APPLE_PRIVATE_KEY = ${chalk.cyan('[written to file]')}\n`);

  } catch (err) {
    console.error(chalk.red(`\n✗ Error: ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

async function selectOrCreateKey(team, keys) {
  console.log(chalk.bold(`\nFound ${keys.length} existing API key(s):\n`));

  const choices = [
    ...keys.map(k => ({
      name: `${k.name}  [${k.keyId}]`,
      value: k.keyId,
    })),
    { name: chalk.yellow('+ Create a new key (downloads private key)'), value: '__new__' },
  ];

  const { selectedKeyId } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedKeyId',
    message: 'Select an API key:',
    choices,
  }]);

  if (selectedKeyId === '__new__') {
    return createNewKey(team);
  }

  // Existing key — private key cannot be re-downloaded from Apple
  const selectedKey = keys.find(k => k.keyId === selectedKeyId);

  console.log(chalk.yellow(
    `\nNote: The private key for "${selectedKey.name}" was only downloadable once when created.`
  ));

  const { privateKeySource } = await inquirer.prompt([{
    type: 'list',
    name: 'privateKeySource',
    message: 'Provide the private key:',
    choices: [
      { name: 'Path to existing .p8 file', value: 'path' },
      { name: 'Paste the key content directly', value: 'paste' },
    ],
  }]);

  let privateKey;

  if (privateKeySource === 'path') {
    const { filePath } = await inquirer.prompt([{
      type: 'input',
      name: 'filePath',
      message: 'Path to .p8 file:',
      validate: v => {
        try { readFileSync(v.trim()); return true; }
        catch { return `File not found: ${v.trim()}`; }
      },
    }]);
    privateKey = readFileSync(filePath.trim(), 'utf8');
  } else {
    const { pasted } = await inquirer.prompt([{
      type: 'editor',
      name: 'pasted',
      message: 'Paste the private key content (opens editor):',
    }]);
    privateKey = pasted;
  }

  return { keyId: selectedKeyId, privateKey };
}

async function createNewKey(team) {
  const { keyName } = await inquirer.prompt([{
    type: 'input',
    name: 'keyName',
    message: 'Name for the new API key:',
    default: 'EBA CLI Key',
    validate: v => v.trim().length > 0 ? true : 'Name cannot be empty',
  }]);

  console.log(chalk.dim(`\nCreating API key "${keyName}"...`));
  const created = await createApiKey(team, keyName.trim());

  console.log(chalk.dim(`Downloading private key for ${created.keyId}...`));
  const privateKey = await downloadPrivateKey(team, created.keyId);

  console.log(chalk.green(`✓ Created key: ${created.name} [${created.keyId}]`));

  return { keyId: created.keyId, privateKey };
}
