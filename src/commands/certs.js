import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import pkg from '@expo/apple-utils';
import { appleLoginWithTeam } from '../auth/apple.js';

const { Certificate, CertificateType } = pkg;

const CERT_TYPE_LABELS = {
  [CertificateType.IOS_DEVELOPMENT]: 'iOS Development',
  [CertificateType.IOS_DISTRIBUTION]: 'iOS Distribution',
  [CertificateType.DISTRIBUTION]: 'Distribution',
  [CertificateType.DEVELOPMENT]: 'Development',
  [CertificateType.MAC_APP_DISTRIBUTION]: 'Mac Distribution',
  [CertificateType.MAC_APP_DEVELOPMENT]: 'Mac Development',
  [CertificateType.DEVELOPER_ID_APPLICATION]: 'Developer ID',
  [CertificateType.APPLE_PUSH_SERVICES]: 'APNs',
};

const CERT_TYPE_USAGE = {
  [CertificateType.IOS_DEVELOPMENT]: 'Run & debug apps on physical devices via Xcode',
  [CertificateType.IOS_DISTRIBUTION]: 'Sign apps for App Store, Ad Hoc & Enterprise distribution',
  [CertificateType.DISTRIBUTION]: 'Sign apps for App Store & Ad Hoc (Apple unified)',
  [CertificateType.DEVELOPMENT]: 'Run & debug on device (Apple unified)',
  [CertificateType.MAC_APP_DISTRIBUTION]: 'Sign Mac apps for App Store submission',
  [CertificateType.MAC_APP_DEVELOPMENT]: 'Run & debug Mac apps on your own machine',
  [CertificateType.DEVELOPER_ID_APPLICATION]: 'Sign Mac apps distributed outside the App Store',
  [CertificateType.APPLE_PUSH_SERVICES]: 'Send push notifications (APNs) to users',
};

const IOS_CERT_TYPES = [
  CertificateType.IOS_DISTRIBUTION,
  CertificateType.IOS_DEVELOPMENT,
  CertificateType.DISTRIBUTION,
  CertificateType.DEVELOPMENT,
  CertificateType.APPLE_PUSH_SERVICES,
];

function formatExpiry(dateString) {
  if (!dateString) return chalk.dim('—');
  const exp = new Date(dateString);
  const daysLeft = Math.round((exp - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return chalk.red(`${Math.abs(daysLeft)}d ago`);
  if (daysLeft < 30) return chalk.yellow(`in ${daysLeft}d`);
  return chalk.green(exp.toLocaleDateString('en-GB'));
}

export async function certsCommand(options) {
  const shouldRevoke = Boolean(options.revoke);

  try {
    const { authState } = await appleLoginWithTeam();

    console.log(chalk.dim('Fetching certificates...\n'));

    const certs = await Certificate.getAsync(authState, { query: { filter: { certificateType: IOS_CERT_TYPES } } });

    if (!certs.length) {
      console.log(chalk.yellow('No iOS certificates found.\n'));
      return;
    }

    const certInfos = await Promise.all(certs.map(c => Certificate.infoAsync(authState, { id: c.id }).catch(() => c)));

    console.log(chalk.bold(`🔐 Certificates (${certInfos.length}):\n`));

    const table = new Table({
      head: [
        chalk.dim('#'),
        chalk.bold('Name'),
        chalk.bold('Type'),
        chalk.bold('Usage'),
        chalk.bold('Serial'),
        chalk.bold('Expiry'),
      ],
      style: { head: [], border: ['dim'] },
      wordWrap: true,
      colWidths: [4, 30, 16, 42, 36, 14],
    });

    certInfos.forEach((c, i) => {
      const certType = c.attributes?.certificateType;
      const type = CERT_TYPE_LABELS[certType] ?? certType ?? '?';
      const usage = CERT_TYPE_USAGE[certType] ?? chalk.dim('—');
      const name = c.attributes?.name ?? c.attributes?.displayName ?? c.id;
      const serial = c.attributes?.serialNumber ?? chalk.dim('—');
      const expiry = formatExpiry(c.attributes?.expirationDate);
      table.push([chalk.dim(String(i)), name, chalk.cyan(type), chalk.dim(usage), serial, expiry]);
    });

    console.log(table.toString());
    console.log('');

    if (shouldRevoke) {
      const { certIndex } = await inquirer.prompt([{
        type: 'list',
        name: 'certIndex',
        message: 'Select certificate to revoke:',
        choices: certInfos.map((c, i) => ({
          name: `[${i}] ${c.attributes?.name ?? c.id} (${CERT_TYPE_LABELS[c.attributes?.certificateType] ?? '?'})`,
          value: i,
        })),
      }]);

      const selected = certInfos[certIndex];
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`⚠ Revoke "${selected.attributes?.name ?? selected.id}"? This cannot be undone.`),
        default: false,
      }]);

      if (!confirm) {
        console.log(chalk.dim('Revoke cancelled.\n'));
        return;
      }

      await Certificate.deleteAsync(authState, { id: selected.id });
      console.log(chalk.green(`\n✓ Certificate revoked.\n`));
    }

  } catch (err) {
    console.error(chalk.red(`\n✗ ${err.message}\n`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}
