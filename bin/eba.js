#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { initCommand } from '../src/commands/init.js';
import { buildCommand } from '../src/commands/build.js';
import { prebuildCommand } from '../src/commands/prebuild.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('eba')
  .description('EBA CLI — Apple Developer & App Store Connect tools')
  .version(version);

program
  .command('init')
  .description('Create eba.json config file in current directory')
  .action(initCommand);

program
  .command('build')
  .description('Start an Xcode Cloud build on App Store Connect')
  .option('-e, --env <environment>', 'Build environment defined in eba.json', 'production')
  .action(buildCommand);

program
  .command('prebuild')
  .description('Generate Xcode Cloud ci_scripts for an existing ios/ folder')
  .action(prebuildCommand);

program.parse(process.argv);
