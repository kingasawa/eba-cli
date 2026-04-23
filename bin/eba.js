#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { buildCommand } from '../src/commands/build.js';
import { prebuildCommand } from '../src/commands/prebuild.js';
import { devicesCommand } from '../src/commands/devices.js';
import { certsCommand } from '../src/commands/certs.js';
import { profilesCommand } from '../src/commands/profiles.js';
import { bundleIdsCommand } from '../src/commands/bundle-ids.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('eba')
  .description('EBA CLI — Build iOS apps on Xcode Cloud without EAS limits')
  .version(version);

program
  .command('build')
  .description('Trigger an Xcode Cloud build using config from eas.json')
  .option('-e, --env <environment>', 'Build environment defined in eas.json', 'production')
  .action(buildCommand);


program
  .command('prebuild')
  .description('Generate Xcode Cloud ci_scripts for an existing ios/ folder')
  .action(prebuildCommand);

program
  .command('devices')
  .description('List or register iOS devices in your Apple Developer account')
  .option('--register', 'Register a new device by UDID')
  .action(devicesCommand);

program
  .command('certs')
  .description('List iOS distribution & development certificates')
  .option('--revoke', 'Select and revoke a certificate')
  .action(certsCommand);

program
  .command('profiles')
  .description('List iOS provisioning profiles')
  .option('--delete', 'Select and delete a provisioning profile')
  .action(profilesCommand);

program
  .command('bundle-ids')
  .description('List or register bundle IDs (App IDs)')
  .option('--register', 'Register a new bundle ID')
  .option('--filter <query>', 'Filter by bundle ID or name')
  .option('--capabilities', 'Show capabilities per bundle ID (slower)')
  .action(bundleIdsCommand);

program.parse(process.argv);
