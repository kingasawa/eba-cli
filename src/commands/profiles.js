import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import pkg from '@expo/apple-utils';
import { appleLoginWithTeam } from '../auth/apple.js';

const { Profile, ProfileType, ProfileState } = pkg;

const PROFILE_TYPE_LABELS = {
  [ProfileType.IOS_APP_STORE]: 'App Store',
  [ProfileType.IOS_APP_DEVELOPMENT]: 'Development',
  [ProfileType.IOS_APP_ADHOC]: 'Ad Hoc',
  [ProfileType.IOS_APP_INHOUSE]: 'Enterprise (In-House)',
  [ProfileType.TVOS_APP_STORE]: 'tvOS App Store',
  [ProfileType.TVOS_APP_DEVELOPMENT]: 'tvOS Development',
  [ProfileType.TVOS_APP_ADHOC]: 'tvOS Ad Hoc',
  [ProfileType.MAC_APP_STORE]: 'Mac App Store',
  [ProfileType.MAC_APP_DEVELOPMENT]: 'Mac Development',
  [ProfileType.MAC_APP_DIRECT]: 'Mac Direct Distribution',
};

const IOS_PROFILE_TYPES = [
  ProfileType.IOS_APP_STORE,
  ProfileType.IOS_APP_DEVELOPMENT,
  ProfileType.IOS_APP_ADHOC,
  ProfileType.IOS_APP_INHOUSE,
];

function formatState(state) {
  if (!state) return '';
  if (state === ProfileState?.ACTIVE || state === 'ACTIVE') return chalk.green('active');
  if (state === 'EXPIRED') return chalk.red('expired');
  if (state === 'INVALID') return chalk.red('invalid');
  return chalk.dim(state.toLowerCase());
}

function formatExpiry(dateString) {
  if (!dateString) return chalk.dim('—');
  const exp = new Date(dateString);
  const daysLeft = Math.round((exp - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return chalk.red(`${Math.abs(daysLeft)}d ago`);
  if (daysLeft < 30) return chalk.yellow(`in ${daysLeft}d`);
  return chalk.dim(exp.toLocaleDateString('en-GB'));
}

function extractBundleId(p) {
  // bundleId may be a string, an object with identifier, or a relationship
  const raw = p.attributes?.bundleId
    ?? p.relationships?.bundleId?.data?.id
    ?? null;
  if (!raw) return '—';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return raw.identifier ?? raw.id ?? JSON.stringify(raw);
  return String(raw);
}

export async function profilesCommand(options) {
  const shouldDelete = Boolean(options.delete);

  try {
    const { authState } = await appleLoginWithTeam();

    console.log(chalk.dim('Fetching provisioning profiles...\n'));

    const profiles = await Profile.getAsync(authState, {
      query: { filter: { profileType: IOS_PROFILE_TYPES } },
    });

    if (!profiles.length) {
      console.log(chalk.yellow('No iOS provisioning profiles found.\n'));
      return;
    }

    console.log(chalk.bold(`📋 Provisioning profiles (${profiles.length}):\n`));

    const table = new Table({
      head: [
        chalk.dim('#'),
        chalk.bold('Name'),
        chalk.bold('Type'),
        chalk.bold('Bundle ID'),
        chalk.bold('Status'),
        chalk.bold('Expiry'),
      ],
      style: { head: [], border: ['dim'] },
      wordWrap: true,
      colWidths: [4, 38, 13, 32, 9, 13],
    });

    profiles.forEach((p, i) => {
      const type = PROFILE_TYPE_LABELS[p.attributes?.profileType] ?? p.attributes?.profileType ?? '?';
      const name = p.attributes?.name ?? p.id;
      const state = formatState(p.attributes?.profileState);
      const expiry = formatExpiry(p.attributes?.expirationDate);
      const bundleId = extractBundleId(p);
      table.push([chalk.dim(String(i)), name, chalk.cyan(type), chalk.dim(bundleId), state, expiry]);
    });

    console.log(table.toString());
    console.log('');

    if (shouldDelete) {
      const { profileIndex } = await inquirer.prompt([{
        type: 'list',
        name: 'profileIndex',
        message: 'Select profile to delete:',
        choices: profiles.map((p, i) => ({
          name: `[${i}] ${p.attributes?.name ?? p.id} (${PROFILE_TYPE_LABELS[p.attributes?.profileType] ?? '?'})`,
          value: i,
        })),
      }]);

      const selected = profiles[profileIndex];

      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`⚠ Delete profile "${selected.attributes?.name ?? selected.id}"?`),
        default: false,
      }]);

      if (!confirm) {
        console.log(chalk.dim('Delete cancelled.\n'));
        return;
      }

      await Profile.deleteAsync(authState, { id: selected.id });
      console.log(chalk.green(`\n✓ Profile deleted.\n`));
    }

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}
