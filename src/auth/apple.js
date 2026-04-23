import pkg from '@expo/apple-utils';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const { Auth, Teams } = pkg;

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
  const sessionAge = Date.now() - lastLoginTime;

  // Silent restore if session is < 1h old
  if (allowRestore && lastAppleId && sessionAge < ONE_HOUR) {
    try {
      const authState = await Auth.loginAsync({ username: lastAppleId, cookies: true });
      console.log(chalk.dim(`Session restored for ${lastAppleId} (expires in ${Math.round((ONE_HOUR - sessionAge) / 60000)}m)`));
      return authState;
    } catch {
      console.log(chalk.dim('Cached session expired, please log in again.'));
    }
  }

  // Full interactive login
  console.log(chalk.bold('\nApple Developer Login\n'));

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
    },
  ]);

  console.log(chalk.dim('\nConnecting to Apple...\n'));

  const authState = await Auth.loginAsync({ username: appleId, password });

  saveConfig({ ...config, lastAppleId: appleId, lastLoginTime: Date.now() });

  console.log(chalk.green(`\n✓ Signed in as ${appleId}`));

  return authState;
}

/**
 * Login + select team → return team-scoped authState.
 * Team selection is cached for 1 hour alongside the Apple ID session.
 * Returns { authState, team }
 */
export async function appleLoginWithTeam({ allowRestore = true } = {}) {
  const config = loadConfig();
  const lastAppleId = config.lastAppleId ?? '';
  const cachedTeamId = config.lastTeamId ?? '';
  const cachedTeamName = config.lastTeamName ?? '';
  const sessionAge = Date.now() - (config.lastLoginTime ?? 0);
  const sessionFresh = allowRestore && lastAppleId && sessionAge < ONE_HOUR;

  // Step 1: get initial auth state
  const baseAuthState = await appleLogin({ allowRestore });

  // Step 2: select team — skip prompt if session fresh and team cached
  let team;
  if (sessionFresh && cachedTeamId) {
    try {
      team = await Teams.selectTeamAsync({ teamId: cachedTeamId });
      console.log(chalk.dim(`Team: ${team.name} (${team.teamId})\n`));
    } catch {
      // cached team no longer valid, fall through to prompt
      team = null;
    }
  }

  if (!team) {
    team = await Teams.selectTeamAsync();
    console.log(chalk.dim(`Team: ${team.name} (${team.teamId})\n`));
    // Save team alongside session
    saveConfig({ ...loadConfig(), lastTeamId: team.teamId, lastTeamName: team.name });
  }

  // Step 3: inject teamId into authState — Developer Portal APIs check authState.teamId directly
  const authState = { ...baseAuthState, teamId: team.teamId };

  return { authState, team };
}
