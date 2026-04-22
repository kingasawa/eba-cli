import { writeFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

/**
 * Write Apple API keys to a markdown file.
 */
export function writeAppleInfo(outputPath, { keyId, issuerId, privateKey }) {
  const absPath = resolve(process.cwd(), outputPath);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const content = `# Apple Developer API Keys

Generated: ${timestamp}

## Keys

| Variable | Value |
|----------|-------|
| APPLE_KEY_ID | \`${keyId}\` |
| APPLE_ISSUER_ID | \`${issuerId}\` |

## APPLE_PRIVATE_KEY

\`\`\`
${privateKey.trim()}
\`\`\`

---

> **Security notice:** Keep this file private. Do not commit it to version control.
> Add \`apple info.md\` to your \`.gitignore\`.
`;

  writeFileSync(absPath, content, 'utf8');
  console.log(chalk.green(`\n✓ Keys written to: ${absPath}`));
}
