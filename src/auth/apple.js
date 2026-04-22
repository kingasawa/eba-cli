import pkg from '@expo/apple-utils';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const { Auth } = pkg;

// ─── Config (~/.eba-cli/config.json) ─────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.eba-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ONE_HOUR = 60 * 60 * 1000;

function loadConfig() {
  try {
    return existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
  } catch {
    return {};
  }
}

function saveConfig(data) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * @param {{ allowRestore?: boolean }} opts
 *   allowRestore: if true and last login was < 1h ago, restore session silently.
 */
export async function appleLogin({ allowRestore = false } = {}) {
  const config = loadConfig();
  const lastLoginTime = config.lastLoginTime ?? 0;
  const lastAppleId = config.lastAppleId ?? '';
  const lastPassword = config.lastPassword ?? '';
  const sessionAge = Date.now() - lastLoginTime;

  // Silent restore if session is < 1h old
  if (allowRestore && lastAppleId && sessionAge < ONE_HOUR) {
    try {
      await Auth.loginAsync({ username: lastAppleId, cookies: true });
      console.log(chalk.dim(`Session restored for ${lastAppleId} (expires in ${Math.round((ONE_HOUR - sessionAge) / 60000)}m)`));
      return;
    } catch {
      console.log(chalk.dim('Cached session expired, please log in again.'));
    }
  }

  // Full interactive login
  console.log(chalk.bold('\n🍎 Apple Developer Login\n'));

  if (lastAppleId) {
    console.log(chalk.dim(`Last used: ${lastAppleId}  (press Enter to reuse)\n`));
  }

  const { appleId, password } = await inquirer.prompt([
    {
      type: 'input',
      name: 'appleId',
      message: 'Apple ID (email):',
      default: lastAppleId || undefined,
      validate: v => v.includes('@') ? true : 'Enter a valid Apple ID email',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*',
      default: lastPassword || undefined,
    },
  ]);

  console.log(chalk.dim('\nConnecting to Apple...\n'));

  await Auth.loginAsync({ username: appleId, password });

  saveConfig({ ...config, lastAppleId: appleId, lastPassword: password, lastLoginTime: Date.now() });

  console.log(chalk.green(`\n✓ Signed in as ${appleId}`));
}
