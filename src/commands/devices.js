import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from '@expo/apple-utils';
import { appleLoginWithTeam } from '../auth/apple.js';
import { startUdidServer } from '../utils/udid-server.js';

const { Device, DeviceClass, DeviceStatus } = pkg;

const DEVICE_CLASS_LABELS = {
  [DeviceClass.IPHONE]: 'iPhone',
  [DeviceClass.IPAD]: 'iPad',
  [DeviceClass.APPLE_WATCH]: 'Apple Watch',
  [DeviceClass.APPLE_TV]: 'Apple TV',
  [DeviceClass.IPOD]: 'iPod',
  [DeviceClass.MAC]: 'Mac',
};

function formatDeviceRow(d) {
  const name = d.attributes?.name ?? '(unnamed)';
  const udid = d.attributes?.udid ?? d.id;
  const cls = DEVICE_CLASS_LABELS[d.attributes?.deviceClass] ?? d.attributes?.deviceClass ?? '?';
  const status = d.attributes?.status === DeviceStatus.DISABLED
    ? chalk.dim('[disabled]')
    : chalk.green('[enabled]');
  return `  ${chalk.white(name)}  ${chalk.dim(udid)}  ${chalk.cyan(cls)}  ${status}`;
}

export async function devicesCommand(options) {
  const action = options.register ? 'register' : 'list';

  try {
    const { authState } = await appleLoginWithTeam();

    if (action === 'list') {
      console.log(chalk.dim('Fetching registered devices...\n'));

      const devices = await Device.getAsync(authState);

      if (!devices.length) {
        console.log(chalk.yellow('No registered devices found.\n'));
        return;
      }

      const enabled = devices.filter(d => d.attributes?.status !== DeviceStatus.DISABLED);
      const disabled = devices.filter(d => d.attributes?.status === DeviceStatus.DISABLED);

      console.log(chalk.bold(`📱 Registered devices (${devices.length} total, ${enabled.length} enabled):\n`));
      enabled.forEach(d => console.log(formatDeviceRow(d)));

      if (disabled.length) {
        console.log(chalk.dim(`\nDisabled (${disabled.length}):`));
        disabled.forEach(d => console.log(formatDeviceRow(d)));
      }

      console.log('');

      const { next } = await inquirer.prompt([{
        type: 'list',
        name: 'next',
        message: 'What next?',
        choices: [
          { name: '➕  Register a new device', value: 'register' },
          { name: '✖   Exit', value: 'exit' },
        ],
        default: 'exit',
      }]);

      if (next === 'exit') return;
    }

    await registerDevice(authState, options.port ? parseInt(options.port, 10) : 9876);

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

async function registerDevice(authState, port = 9876) {
  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: 'How do you want to get the device UDID?',
    choices: [
      { name: '📲  Scan QR code on device (same WiFi required)', value: 'qr' },
      { name: '⌨️   Enter UDID manually', value: 'manual' },
    ],
    default: 'qr',
  }]);

  let udid = '';
  let defaultName = '';

  if (method === 'qr') {
    try {
      const result = await startUdidServer({ port });
      udid = result.udid;
      defaultName = result.deviceName ?? '';
      console.log(chalk.green(`\n✓ UDID received: ${chalk.bold(udid)}`));
      if (defaultName) console.log(chalk.dim(`  Device: ${defaultName}\n`));
    } catch (err) {
      console.log(chalk.yellow(`\n⚠ QR scan failed: ${err.message}`));
      console.log(chalk.dim('Falling back to manual entry...\n'));
      const { manualUdid } = await inquirer.prompt([{
        type: 'input',
        name: 'manualUdid',
        message: 'Device UDID:',
        validate: v => v.trim().length >= 25 ? true : 'Enter a valid UDID (25+ characters)',
      }]);
      udid = manualUdid.trim();
    }
  } else {
    const { manualUdid } = await inquirer.prompt([{
      type: 'input',
      name: 'manualUdid',
      message: 'Device UDID:',
      validate: v => v.trim().length >= 25 ? true : 'Enter a valid UDID (25+ characters)',
    }]);
    udid = manualUdid.trim();
  }

  const { name, deviceClass } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Device name (label):',
      default: defaultName || undefined,
      validate: v => Boolean(v.trim()) || 'Name is required',
    },
    {
      type: 'list',
      name: 'deviceClass',
      message: 'Device class:',
      choices: [
        { name: 'iPhone', value: DeviceClass.IPHONE },
        { name: 'iPad', value: DeviceClass.IPAD },
        { name: 'Mac', value: DeviceClass.MAC },
        { name: 'Apple Watch', value: DeviceClass.APPLE_WATCH },
        { name: 'Apple TV', value: DeviceClass.APPLE_TV },
        { name: 'iPod', value: DeviceClass.IPOD },
      ],
      default: DeviceClass.IPHONE,
    },
  ]);

  console.log(chalk.dim('\nRegistering device...\n'));

  try {
    const device = await Device.createAsync(authState, {
      name: name.trim(),
      udid,
      platform: 'IOS',
      deviceClass,
    });
    console.log(chalk.green(`✓ Device registered: ${device.attributes?.name ?? name} (${udid})\n`));
  } catch (err) {
    if (err.message?.toLowerCase().includes('already exists')) {
      console.log(chalk.yellow(`⚠ Device already registered on this team: ${udid}`));
      console.log(chalk.dim('  No changes needed.\n'));
    } else {
      throw err;
    }
  }

  const { again } = await inquirer.prompt([{
    type: 'confirm',
    name: 'again',
    message: 'Register another device?',
    default: false,
  }]);

  if (again) await registerDevice(authState, port);
}
