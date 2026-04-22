import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import chalk from 'chalk';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export async function initCommand() {
  const configPath = resolve(process.cwd(), 'eba.json');

  if (existsSync(configPath)) {
    console.log(chalk.yellow(`eba.json already exists at ${configPath}`));
    return;
  }

  const template = {
    cli: { version },
    build: {
      production: {
        ios: {
          ascAppId: '',
        },
      },
    },
  };

  writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n', 'utf8');

  console.log(chalk.green('✓ Created eba.json\n'));
  console.log('Next steps:');
  console.log(chalk.dim(`  • Fill in ${chalk.white('build.production.ios.ascAppId')} with your App Store Connect app ID`));
  console.log(chalk.dim(`  • Run ${chalk.white('eba build')} to start a build\n`));
}
