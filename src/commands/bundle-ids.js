import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from '@expo/apple-utils';
import { appleLoginWithTeam } from '../auth/apple.js';

const { BundleId, BundleIdPlatform, BundleIdCapability, CapabilityType } = pkg;

const CAPABILITY_LABELS = {
  [CapabilityType.PUSH_NOTIFICATIONS]: 'Push Notifications',
  [CapabilityType.APPLE_ID_AUTH]: 'Sign in with Apple',
  [CapabilityType.ICLOUD]: 'iCloud',
  [CapabilityType.ASSOCIATED_DOMAINS]: 'Associated Domains',
  [CapabilityType.IN_APP_PURCHASE]: 'In-App Purchase',
  [CapabilityType.GAME_CENTER]: 'Game Center',
  [CapabilityType.WALLET]: 'Wallet',
  [CapabilityType.HEALTHKIT]: 'HealthKit',
  [CapabilityType.HOMEKIT]: 'HomeKit',
  [CapabilityType.SIRI]: 'Siri',
  [CapabilityType.MAPS]: 'Maps',
  [CapabilityType.PERSONAL_VPN]: 'Personal VPN',
  [CapabilityType.APP_GROUPS]: 'App Groups',
};

export async function bundleIdsCommand(options) {
  const shouldRegister = Boolean(options.register);
  const filter = options.filter;

  try {
    const { authState } = await appleLoginWithTeam();

    if (shouldRegister) {
      const { identifier, name, platform } = await inquirer.prompt([
        {
          type: 'input',
          name: 'identifier',
          message: 'Bundle ID (reverse domain, e.g. com.example.app):',
          validate: v => /^[a-zA-Z0-9\-\.]+$/.test(v.trim()) ? true : 'Invalid bundle ID format',
        },
        {
          type: 'input',
          name: 'name',
          message: 'App name / label:',
          validate: v => Boolean(v.trim()) || 'Name is required',
        },
        {
          type: 'list',
          name: 'platform',
          message: 'Platform:',
          choices: [
            { name: 'iOS', value: BundleIdPlatform.IOS },
            { name: 'macOS', value: BundleIdPlatform.MAC_OS },
            { name: 'Universal', value: BundleIdPlatform.UNIVERSAL },
          ],
          default: BundleIdPlatform.IOS,
        },
      ]);

      console.log(chalk.dim('\nRegistering bundle ID...\n'));

      const bundleId = await BundleId.createAsync(authState, {
        identifier: identifier.trim(),
        name: name.trim(),
        platform,
      });

      const registeredId = bundleId.attributes?.identifier ?? identifier;
      console.log(chalk.green(`✓ Bundle ID registered: ${registeredId}\n`));
      return;
    }

    // List mode
    console.log(chalk.dim('Fetching bundle IDs...\n'));

    const all = await BundleId.getAsync(authState, {
      query: { filter: { platform: BundleIdPlatform.IOS } },
    });

    let displayed = all;
    if (filter) {
      const lc = filter.toLowerCase();
      displayed = all.filter(b =>
        (b.attributes?.identifier ?? '').toLowerCase().includes(lc) ||
        (b.attributes?.name ?? '').toLowerCase().includes(lc)
      );
    }

    if (!displayed.length) {
      console.log(chalk.yellow(filter
        ? `No bundle IDs matching "${filter}".\n`
        : 'No iOS bundle IDs found.\n'
      ));
      return;
    }

    console.log(chalk.bold(`📦 Bundle IDs (${displayed.length}${filter ? ` matching "${filter}"` : ''}):\n`));

    for (const b of displayed) {
      const id = b.attributes?.identifier ?? b.id;
      const name = b.attributes?.name ?? '';
      const platform = b.attributes?.platform ?? '';
      console.log(`  ${chalk.white(id)}  ${chalk.dim(name)}  ${chalk.cyan(platform)}`);

      // Show capabilities if available
      if (options.capabilities) {
        try {
          const caps = await BundleIdCapability.getAsync(authState, { bundleId: b.id });
          if (caps?.length) {
            const capLabels = caps.map(c => CAPABILITY_LABELS[c.attributes?.capabilityType] ?? c.attributes?.capabilityType).filter(Boolean);
            if (capLabels.length) console.log(chalk.dim(`    Capabilities: ${capLabels.join(', ')}`));
          }
        } catch {
          // skip if capabilities fetch fails
        }
      }
    }

    if (filter && all.length > displayed.length) {
      console.log(chalk.dim(`\n(${all.length - displayed.length} more — remove --filter to see all)`));
    }

    console.log('');

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

