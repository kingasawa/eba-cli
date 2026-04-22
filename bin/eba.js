#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { buildCommand } from '../src/commands/build.js';
import { prebuildCommand } from '../src/commands/prebuild.js';

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

program.parse(process.argv);
